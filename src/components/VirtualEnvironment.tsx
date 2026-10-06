import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Square, RotateCcw, X, Sliders, Map as MapIcon, RefreshCw, ChevronRight, HelpCircle, Eye, EyeOff, Home, ZoomIn, ZoomOut, Upload, Trash2, Maximize2, Minimize2, Layers, Save, Download } from 'lucide-react';
import { motion } from 'motion/react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

interface VirtualEnvironmentProps {
  code: string;
  onClose: () => void;
  motors: any[];
  sensors: any[];
  wheelDiameter: number;
  wheelDistance: number;
  maxMotorSpeed: number;
  isVirtualActive?: boolean;
  language?: 'it' | 'en';
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pushable?: boolean;
  shape?: 'square' | 'circle';
  color?: string;
}

// Map styles
type MapType = 'line' | 'colors' | 'maze' | 'empty' | 'custom';

export default function VirtualEnvironment({
  code,
  onClose,
  motors,
  sensors,
  wheelDiameter,
  wheelDistance,
  maxMotorSpeed,
  isVirtualActive,
  language = 'it',
}: VirtualEnvironmentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement>(null);

  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    robotGroup: THREE.Group;
    leftWheel: THREE.Group;
    rightWheel: THREE.Group;
    ledScreenMesh: THREE.Mesh;
    ledTexture: THREE.CanvasTexture;
    ledCanvas: HTMLCanvasElement;
    obstacleMeshes: Map<number, THREE.Object3D>;
    trailLine: THREE.Line;
    floorMesh: THREE.Mesh;
    floorTexture: THREE.CanvasTexture;
    sensorGroup: THREE.Group;
    lights: THREE.Light[];
    dragPlane: THREE.Plane;
  } | null>(null);

  // Simulation State
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapType, setMapType] = useState<MapType>('line');
  const [trailEnabled, setTrailEnabled] = useState(true);
  const [isDraggingObstacle, setIsDraggingObstacle] = useState<number | null>(null);
  const [isDraggingRobot, setIsDraggingRobot] = useState(false);
  const startPosRef = useRef({ x: 150, y: 200, angle: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });

  // Fullscreen and Sidebar custom states to maximize the robot simulation view
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Zoom & Pan State / Refs
  const scaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Escape key handler to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Custom image upload states & handlers
  const [customBgImage, setCustomBgImage] = useState<HTMLImageElement | null>(null);
  const [customBgImageSrc, setCustomBgImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileImportInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setCustomBgImage(img);
        setCustomBgImageSrc(dataUrl);
        setConsoleLogs(prev => [...prev, `[Simulatore] Caricata immagine di sfondo personalizzata: ${file.name}`]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const applyLayoutData = (data: any) => {
    if (data.mapType) {
      setMapType(data.mapType);
    }
    if (data.obstacles) {
      setObstacles(data.obstacles);
      obstaclesRef.current = data.obstacles;
    }
    if (data.startPos) {
      startPosRef.current = data.startPos;
      // Reset the current robot position to startPos
      robotRef.current.x = data.startPos.x;
      robotRef.current.y = data.startPos.y;
      robotRef.current.angle = data.startPos.angle;
      robotRef.current.yawResetAngle = data.startPos.angle;
      robotRef.current.trail = [];
    }
    if (data.customBgImageSrc) {
      setCustomBgImageSrc(data.customBgImageSrc);
      const img = new Image();
      img.onload = () => {
        setCustomBgImage(img);
      };
      img.src = data.customBgImageSrc;
    } else {
      setCustomBgImage(null);
      setCustomBgImageSrc(null);
    }
  };

  const saveLayoutToLocalStorage = () => {
    try {
      const layoutData = {
        mapType,
        customBgImageSrc,
        obstacles,
        startPos: startPosRef.current
      };
      localStorage.setItem('openroberta_sim_saved_field', JSON.stringify(layoutData));
      setConsoleLogs(prev => [...prev, '[Simulatore] Campo simulato salvato correttamente nel browser.']);
    } catch (error) {
      console.error(error);
      setConsoleLogs(prev => [...prev, '[Errore] Impossibile salvare nel browser (l\'immagine potrebbe essere troppo grande). Prova ad esportare come File.']);
    }
  };

  const loadLayoutFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('openroberta_sim_saved_field');
      if (!saved) {
        setConsoleLogs(prev => [...prev, '[Simulatore] Nessun salvataggio trovato nel browser.']);
        return;
      }
      const data = JSON.parse(saved);
      applyLayoutData(data);
      setConsoleLogs(prev => [...prev, '[Simulatore] Campo simulato caricato dal browser.']);
    } catch (error) {
      console.error(error);
      setConsoleLogs(prev => [...prev, '[Errore] Impossibile caricare il campo dal browser.']);
    }
  };

  const exportLayoutToFile = () => {
    try {
      const layoutData = {
        mapType,
        customBgImageSrc,
        obstacles,
        startPos: startPosRef.current
      };
      const jsonString = JSON.stringify(layoutData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `campo_simulato_${mapType}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setConsoleLogs(prev => [...prev, '[Simulatore] Campo esportato come file JSON con successo.']);
    } catch (error) {
      console.error(error);
      setConsoleLogs(prev => [...prev, '[Errore] Impossibile esportare il campo.']);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        applyLayoutData(data);
        setConsoleLogs(prev => [...prev, `[Simulatore] Importato file campo: ${file.name}`]);
      } catch (err) {
        console.error(err);
        setConsoleLogs(prev => [...prev, '[Errore] File JSON non valido o corrotto.']);
      }
      // We must reset the value of the input so the SAME file can be imported again
      if (fileImportInputRef.current) {
        fileImportInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Robot Physical State (canvas coordinates)
  const robotRef = useRef({
    x: 150,
    y: 200,
    angle: 0, // in degrees, 0 is pointing right
    yawResetAngle: 0,
    leftSpeed: 0,
    rightSpeed: 0,
    matrixText: '',
    matrixImage: '',
    beepActive: false,
    trail: [] as { x: number; y: number }[],
    // Sensors readings
    distance: 200,
    color: -1, // -1 means none, 0=Nero, 3=Blu, 5=Verde, 7=Giallo, 9=Rosso, 10=Bianco
    reflection: 100, // 0 to 100
    collision: false,
  });

  // Keep state for rendering overlay
  const sensorReadingsRef = useRef<{
    [port: string]: {
      type: string;
      color: number;
      colorName: string;
      colorHex: string;
      reflection: number;
      distance: number;
      force: number;
      sensorX: number;
      sensorY: number;
    }
  }>({});

  const [activeSensorsReadings, setActiveSensorsReadings] = useState<any[]>([]);

  const [sensorsDisplay, setSensorsDisplay] = useState({
    x: 150,
    y: 200,
    angle: 0,
    leftSpeed: 0,
    rightSpeed: 0,
    distance: 200,
    colorName: 'Nessuno',
    colorHex: '#CCCCCC',
    reflection: 100,
    collision: false,
    matrixText: '',
    matrixImage: '',
  });

  // Draggable Obstacles list starting empty by default
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);

  const [selectedObstacleId, setSelectedObstacleId] = useState<number | null>(null);

  // Maintain stable reference of obstacles for high-frequency physics
  const obstaclesRef = useRef<Obstacle[]>([]);
  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  // Sync obstacles coordinates from physics loop back to react state when play starts or stops
  useEffect(() => {
    if (!isPlaying) {
      setObstacles([...obstaclesRef.current]);
    }
  }, [isPlaying]);

  // Helper to check if a hex color is gray / neutral
  const isColorGray = (hex: string): boolean => {
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6 && cleanHex.length !== 3) return false;
    const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6), 16);
    // If Red, Green, and Blue values are extremely close, it is a gray, white or black shade
    return Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25;
  };

  const addSolidObstacle = (shape: 'square' | 'circle' = 'square') => {
    const newId = obstacles.length > 0 ? Math.max(...obstacles.map(o => o.id)) + 1 : 1;
    const newObs: Obstacle = {
      id: newId,
      x: 350,
      y: 150,
      w: shape === 'circle' ? 40 : 60,
      h: 40,
      pushable: false,
      shape: shape,
      color: '#4B5563'
    };
    const updated = [...obstacles, newObs];
    setObstacles(updated);
    obstaclesRef.current = updated;
    setSelectedObstacleId(newId);
  };

  const addPushableObstacle = (shape: 'square' | 'circle' = 'square') => {
    const newId = obstacles.length > 0 ? Math.max(...obstacles.map(o => o.id)) + 1 : 1;
    const newObs: Obstacle = {
      id: newId,
      x: 350,
      y: 150,
      w: 40,
      h: 40,
      pushable: true,
      shape: shape,
      color: '#D97706'
    };
    const updated = [...obstacles, newObs];
    setObstacles(updated);
    obstaclesRef.current = updated;
    setSelectedObstacleId(newId);
  };

  const updateSelectedObstacle = (fields: Partial<Obstacle>) => {
    if (selectedObstacleId !== null) {
      const updated = obstacles.map(obs => {
        if (obs.id === selectedObstacleId) {
          let finalColor = fields.color !== undefined ? fields.color : obs.color;
          
          if (obs.pushable) {
            // Moveable objects can be any color
          } else {
            // Walls/muri are always and only dark gray
            finalColor = '#4B5563';
          }

          const updatedObs = { ...obs, ...fields, color: finalColor };
          // If switching to circle, make sure width and height are equal (square aspect)
          if (fields.shape === 'circle') {
            updatedObs.w = obs.w;
            updatedObs.h = obs.w;
          }
          return updatedObs;
        }
        return obs;
      });
      setObstacles(updated);
      obstaclesRef.current = updated;
    }
  };

  const deleteSelectedObstacle = () => {
    if (selectedObstacleId !== null) {
      const updated = obstacles.filter(o => o.id !== selectedObstacleId);
      setObstacles(updated);
      obstaclesRef.current = updated;
      setSelectedObstacleId(null);
    }
  };

  const clearAllObstacles = () => {
    setObstacles([]);
    obstaclesRef.current = [];
    setSelectedObstacleId(null);
  };

  // Thread control for code execution
  const activeExecutionId = useRef<number>(0);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  // Sound Synth API
  const audioCtxRef = useRef<AudioContext | null>(null);

  const triggerBeep = useCallback((freq = 440, duration = 200) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      
      osc.start();
      osc.stop(ctx.currentTime + duration / 1000);
      
      robotRef.current.beepActive = true;
      setTimeout(() => {
        robotRef.current.beepActive = false;
      }, duration);
    } catch (e) {
      console.error("Audio beep fail", e);
    }
  }, []);

  // Set initial robot position depending on map type
  const resetRobot = useCallback((forceDefaultHome = false) => {
    let startX = 150;
    let startY = 200;
    let startAngle = 0;

    if (mapType === 'line') {
      startX = 130;
      startY = 118; // Shifted 17px (approx 5cm) up
      startAngle = 0;
    } else if (mapType === 'colors') {
      startX = 100;
      startY = 200;
      startAngle = 0;
    } else if (mapType === 'maze') {
      startX = 70;
      startY = 70;
      startAngle = 0;
    }

    if (forceDefaultHome) {
      startPosRef.current = { x: startX, y: startY, angle: startAngle };
    }

    const targetX = startPosRef.current.x;
    const targetY = startPosRef.current.y;
    const targetAngle = startPosRef.current.angle;

    robotRef.current = {
      x: targetX,
      y: targetY,
      angle: targetAngle,
      yawResetAngle: targetAngle,
      leftSpeed: 0,
      rightSpeed: 0,
      matrixText: '',
      matrixImage: '',
      beepActive: false,
      trail: [],
      distance: 200,
      color: -1,
      reflection: 100,
      collision: false,
    };

    setSensorsDisplay({
      x: Math.round(targetX),
      y: Math.round(targetY),
      angle: Math.round(targetAngle),
      leftSpeed: 0,
      rightSpeed: 0,
      distance: 200,
      colorName: 'Nessuno',
      colorHex: '#CCCCCC',
      reflection: 100,
      collision: false,
      matrixText: '',
      matrixImage: '',
    });
  }, [mapType]);

  useEffect(() => {
    resetRobot(true);
  }, [mapType, resetRobot]);

  // Synchronize maze obstacles or clear when changing map
  useEffect(() => {
    if (mapType === 'maze') {
      const mazeObstacles: Obstacle[] = [
        { id: 101, x: 10, y: 150, w: 240, h: 10, pushable: true, shape: 'square', color: '#D97706' },
        { id: 102, x: 250, y: 150, w: 10, h: 100, pushable: true, shape: 'square', color: '#D97706' },
        { id: 103, x: 150, y: 250, w: 110, h: 10, pushable: true, shape: 'square', color: '#D97706' },
        { id: 104, x: 400, y: 10, w: 10, h: 210, pushable: true, shape: 'square', color: '#D97706' },
        { id: 105, x: 400, y: 220, w: 250, h: 10, pushable: true, shape: 'square', color: '#D97706' },
        { id: 106, x: 550, y: 120, w: 240, h: 10, pushable: true, shape: 'square', color: '#D97706' },
        { id: 107, x: 150, y: 320, w: 10, h: 50, pushable: true, shape: 'square', color: '#D97706' },
        { id: 108, x: 500, y: 300, w: 10, h: 70, pushable: true, shape: 'square', color: '#D97706' },
      ];
      setObstacles(mazeObstacles);
      obstaclesRef.current = mazeObstacles;
    } else {
      setObstacles([]);
      obstaclesRef.current = [];
    }
  }, [mapType]);

  // Helper to translate client/touch coordinates to canvas coordinates (800x380) taking into account object-contain scaling
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement> | MouseEvent | TouchEvent | WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      if (e.touches.length === 0) {
        if ('targetTouches' in e && (e as TouchEvent).targetTouches.length > 0) {
          clientX = (e as TouchEvent).targetTouches[0].clientX;
          clientY = (e as TouchEvent).targetTouches[0].clientY;
        } else if ('changedTouches' in e && (e as TouchEvent).changedTouches.length > 0) {
          clientX = (e as TouchEvent).changedTouches[0].clientX;
          clientY = (e as TouchEvent).changedTouches[0].clientY;
        } else {
          return { x: 0, y: 0 };
        }
      } else {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const r_img = 800 / 380; // exactly 240 / 114
    const r_container = rect.width / rect.height;
    
    let w_render = rect.width;
    let h_render = rect.height;
    let dx = 0;
    let dy = 0;
    
    if (r_container > r_img) {
      h_render = rect.height;
      w_render = rect.height * r_img;
      dx = (rect.width - w_render) / 2;
    } else {
      w_render = rect.width;
      h_render = rect.width / r_img;
      dy = (rect.height - h_render) / 2;
    }
    
    const clickX = clientX - rect.left - dx;
    const clickY = clientY - rect.top - dy;
    
    const x = (clickX / w_render) * 800;
    const y = (clickY / h_render) * 380;
    
    return { x, y };
  };

  const getWorldCoords = (canvasX: number, canvasY: number) => {
    return {
      x: (canvasX - panOffsetRef.current.x) / scaleRef.current,
      y: (canvasY - panOffsetRef.current.y) / scaleRef.current
    };
  };

  const get3DWorldCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const t = threeRef.current;
    if (!canvas || !t) {
      // Fallback a 2D se Three non è pronto o non caricato
      const rect = canvasRef.current?.getBoundingClientRect() || { left: 0, top: 0, width: 800, height: 380 };
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;
      const x = (clickX / (rect.width || 800)) * 800;
      const y = (clickY / (rect.height || 380)) * 380;
      return {
        x: (x - panOffsetRef.current.x) / scaleRef.current,
        y: (y - panOffsetRef.current.y) / scaleRef.current
      };
    }
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), t.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, targetPoint);

    return {
      x: targetPoint.x + 400,
      y: targetPoint.z + 190
    };
  };

  // Handle Dragging of obstacles or panning
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords3D = get3DWorldCoords(e.clientX, e.clientY);
    const worldX = coords3D.x;
    const worldY = coords3D.y;

    // Check if clicked the robot (within 30 pixels of center)
    const rob = robotRef.current;
    const distToRobot = Math.hypot(worldX - rob.x, worldY - rob.y);
    if (distToRobot < 30) {
      setIsDraggingRobot(true);
      stopSimulationCode();
      setIsPlaying(false);
      dragOffset.current = { x: worldX - rob.x, y: worldY - rob.y };
      if (threeRef.current && threeRef.current.controls) {
        threeRef.current.controls.enabled = false;
      }
      return;
    }

    // Check if clicked an obstacle
    for (let obs of obstacles) {
      let isHit = false;
      if (obs.shape === 'circle') {
        const r = obs.w / 2;
        const cx = obs.x + r;
        const cy = obs.y + r;
        const dx = worldX - cx;
        const dy = worldY - cy;
        if (dx * dx + dy * dy <= r * r) {
          isHit = true;
        }
      } else {
        if (worldX >= obs.x && worldX <= obs.x + obs.w && worldY >= obs.y && worldY <= obs.y + obs.h) {
          isHit = true;
        }
      }

      if (isHit) {
        setIsDraggingObstacle(obs.id);
        setSelectedObstacleId(obs.id);
        setIsSidebarOpen(true);
        dragOffset.current = { x: worldX - obs.x, y: worldY - obs.y };
        if (threeRef.current && threeRef.current.controls) {
          threeRef.current.controls.enabled = false;
        }
        return;
      }
    }

    // Deselect if clicked empty background
    setSelectedObstacleId(null);

    // Otherwise, start panning!
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOffsetStartRef.current = { ...panOffsetRef.current };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRobot) {
      const coords3D = get3DWorldCoords(e.clientX, e.clientY);
      const worldX = coords3D.x;
      const worldY = coords3D.y;

      const newX = Math.max(15, Math.min(800 - 15, worldX - dragOffset.current.x));
      const newY = Math.max(15, Math.min(380 - 15, worldY - dragOffset.current.y));

      robotRef.current.x = newX;
      robotRef.current.y = newY;
      robotRef.current.leftSpeed = 0;
      robotRef.current.rightSpeed = 0;
      
      // Update designated starting position
      startPosRef.current = { x: newX, y: newY, angle: robotRef.current.angle };
    } else if (isDraggingObstacle !== null) {
      const coords3D = get3DWorldCoords(e.clientX, e.clientY);
      const worldX = coords3D.x;
      const worldY = coords3D.y;

      setObstacles(prev =>
        prev.map(obs => {
          if (obs.id === isDraggingObstacle) {
            // Constrain within canvas boundaries
            const newX = Math.max(10, Math.min(800 - obs.w - 10, worldX - dragOffset.current.x));
            const newY = Math.max(10, Math.min(380 - obs.h - 10, worldY - dragOffset.current.y));
            return { ...obs, x: newX, y: newY };
          }
          return obs;
        })
      );
    } else if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      panOffsetRef.current = {
        x: panOffsetStartRef.current.x + dx,
        y: panOffsetStartRef.current.y + dy
      };
    }
  };

  const handleMouseUp = () => {
    setIsDraggingObstacle(null);
    setIsDraggingRobot(false);
    setIsPanning(false);
    if (threeRef.current && threeRef.current.controls) {
      threeRef.current.controls.enabled = true;
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const coords3D = get3DWorldCoords(touch.clientX, touch.clientY);
    const worldX = coords3D.x;
    const worldY = coords3D.y;

    // Check if clicked the robot (within 30 pixels of center)
    const rob = robotRef.current;
    const distToRobot = Math.hypot(worldX - rob.x, worldY - rob.y);
    if (distToRobot < 30) {
      setIsDraggingRobot(true);
      stopSimulationCode();
      setIsPlaying(false);
      dragOffset.current = { x: worldX - rob.x, y: worldY - rob.y };
      if (threeRef.current && threeRef.current.controls) {
        threeRef.current.controls.enabled = false;
      }
      return;
    }

    // Check if touched an obstacle
    for (let obs of obstacles) {
      let isHit = false;
      if (obs.shape === 'circle') {
        const r = obs.w / 2;
        const cx = obs.x + r;
        const cy = obs.y + r;
        const dx = worldX - cx;
        const dy = worldY - cy;
        if (dx * dx + dy * dy <= r * r) {
          isHit = true;
        }
      } else {
        if (worldX >= obs.x && worldX <= obs.x + obs.w && worldY >= obs.y && worldY <= obs.y + obs.h) {
          isHit = true;
        }
      }

      if (isHit) {
        setIsDraggingObstacle(obs.id);
        setSelectedObstacleId(obs.id);
        setIsSidebarOpen(true);
        dragOffset.current = { x: worldX - obs.x, y: worldY - obs.y };
        if (threeRef.current && threeRef.current.controls) {
          threeRef.current.controls.enabled = false;
        }
        return;
      }
    }

    // Deselect if touched empty background
    setSelectedObstacleId(null);

    // Otherwise, start panning!
    setIsPanning(true);
    panStartRef.current = { x: touch.clientX, y: touch.clientY };
    panOffsetStartRef.current = { ...panOffsetRef.current };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    if (isDraggingRobot) {
      const coords3D = get3DWorldCoords(touch.clientX, touch.clientY);
      const worldX = coords3D.x;
      const worldY = coords3D.y;

      const newX = Math.max(15, Math.min(800 - 15, worldX - dragOffset.current.x));
      const newY = Math.max(15, Math.min(380 - 15, worldY - dragOffset.current.y));

      robotRef.current.x = newX;
      robotRef.current.y = newY;
      robotRef.current.leftSpeed = 0;
      robotRef.current.rightSpeed = 0;
      
      // Update designated starting position
      startPosRef.current = { x: newX, y: newY, angle: robotRef.current.angle };
    } else if (isDraggingObstacle !== null) {
      const coords3D = get3DWorldCoords(touch.clientX, touch.clientY);
      const worldX = coords3D.x;
      const worldY = coords3D.y;

      setObstacles(prev =>
        prev.map(obs => {
          if (obs.id === isDraggingObstacle) {
            // Constrain within canvas boundaries
            const newX = Math.max(10, Math.min(800 - obs.w - 10, worldX - dragOffset.current.x));
            const newY = Math.max(10, Math.min(380 - obs.h - 10, worldY - dragOffset.current.y));
            return { ...obs, x: newX, y: newY };
          }
          return obs;
        })
      );
    } else if (isPanning) {
      const dx = touch.clientX - panStartRef.current.x;
      const dy = touch.clientY - panStartRef.current.y;
      panOffsetRef.current = {
        x: panOffsetStartRef.current.x + dx,
        y: panOffsetStartRef.current.y + dy
      };
    }
  };

  const handleZoomIn = () => {
    const t = threeRef.current;
    if (t) {
      const dir = new THREE.Vector3().subVectors(t.camera.position, t.controls.target);
      dir.multiplyScalar(0.8);
      t.camera.position.addVectors(t.controls.target, dir);
      t.controls.update();
    }
  };

  const handleZoomOut = () => {
    const t = threeRef.current;
    if (t) {
      const dir = new THREE.Vector3().subVectors(t.camera.position, t.controls.target);
      dir.multiplyScalar(1.2);
      t.camera.position.addVectors(t.controls.target, dir);
      t.controls.update();
    }
  };

  const handleZoomReset = () => {
    const t = threeRef.current;
    if (t) {
      t.camera.position.set(0, 320, 420);
      t.controls.target.set(0, 0, 0);
      t.controls.update();
    }
  };

  // Python-to-JS parser/transpiler for our Spike Virtual machine
  const transpilePythonToJs = (pythonCode: string) => {
    // 1. Rimuove indentazione iniziale comune
    const stripCommonIndent = (codeStr: string): string => {
      const lines = codeStr.split('\n');
      let minIndent = Infinity;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const indent = line.length - line.trimStart().length;
          if (indent < minIndent) {
            minIndent = indent;
          }
        }
      }
      if (minIndent === Infinity || minIndent === 0) return codeStr;
      return lines.map(line => {
        if (line.trim().length === 0) return '';
        return line.substring(Math.min(minIndent, line.length - line.trimStart().length));
      }).join('\n');
    };

    const strippedPython = stripCommonIndent(pythonCode);

    const translateNot = (str: string): string => {
      let result = '';
      let i = 0;
      while (i < str.length) {
        const remainingFromI = str.substring(i);
        const matchNot = /^not\b/.test(remainingFromI);
        
        if (matchNot && (i === 0 || /\W/.test(str[i - 1]))) {
          let opStart = i + 3;
          while (opStart < str.length && /\s/.test(str[opStart])) {
            opStart++;
          }
          
          let parenDepth = 0;
          let opEnd = opStart;
          while (opEnd < str.length) {
            const char = str[opEnd];
            if (char === '(') {
              parenDepth++;
            } else if (char === ')') {
              if (parenDepth === 0) {
                break;
              }
              parenDepth--;
            } else if (parenDepth === 0) {
              const remaining = str.substring(opEnd);
              const prevChar = opEnd > 0 ? str[opEnd - 1] : '';
              const isPrevWordChar = /[a-zA-Z0-9_]/.test(prevChar);
              if (!isPrevWordChar && /^(and\b|or\b)/.test(remaining)) {
                break;
              }
            }
            opEnd++;
          }
          
          const operand = str.substring(opStart, opEnd);
          const translatedOperand = translateNot(operand);
          result += `!(${translatedOperand})`;
          i = opEnd;
        } else {
          result += str[i];
          i++;
        }
      }
      return result;
    };

    // 2. Sostituzioni Espressioni Python Base
    const translateExpression = (expr: string): string => {
      let e = expr;
      
      e = translateNot(e);
      e = e.replace(/\band\b/g, '&&');
      e = e.replace(/\bor\b/g, '||');
      e = e.replace(/\bTrue\b/g, 'true');
      e = e.replace(/\bFalse\b/g, 'false');
      e = e.replace(/\bNone\b/g, 'null');
      
      e = e.replace(/\bint\(/g, 'py_int(');
      e = e.replace(/\bfloat\(/g, 'py_float(');
      e = e.replace(/\bstr\(/g, 'py_str(');
      e = e.replace(/\blen\(/g, 'py_len(');
      e = e.replace(/\babs\(/g, 'py_abs(');
      e = e.replace(/\bround\(/g, 'py_round(');
      e = e.replace(/\bmin\(/g, 'py_min(');
      e = e.replace(/\bmax\(/g, 'py_max(');
      
      // Standard LEGO Spike sensor calls
      e = e.replace(/color_sensor\.color\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getColor("$1")');
      e = e.replace(/color_sensor\.reflection\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getReflection("$1")');
      e = e.replace(/distance_sensor\.distance\(\s*port\.([a-zA-Z0-9_]+)\s*\)\s*\/\s*10(?:\.0)?/g, 'getDistance("$1")');
      e = e.replace(/distance_sensor\.distance\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getDistance("$1")');
      e = e.replace(/force_sensor\.force\(\s*port\.([a-zA-Z0-9_]+)\s*\)/g, 'getForce("$1")');
      
      // _safe_sensor wrapper calls
      e = e.replace(/_safe_sensor\(color_sensor\.color,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getColor("$1")');
      e = e.replace(/_safe_sensor\(color_sensor\.reflection,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getReflection("$1")');
      e = e.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)\s*\/\s*10(?:\.0)?/g, 'getDistance("$1")');
      e = e.replace(/_safe_sensor\(distance_sensor\.distance,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getDistance("$1")');
      e = e.replace(/_safe_sensor\(force_sensor\.force,\s*port\.([a-zA-Z0-9_]+)(?:,\s*[^)]*)?\)/g, 'getForce("$1")');
      e = e.replace(/_safe_sensor\(motion_sensor\.yaw_angle\)/g, 'getYaw()');
      e = e.replace(/_safe_sensor\(motion_sensor\.pitch_angle\)/g, 'getPitch()');
      e = e.replace(/_safe_sensor\(motion_sensor\.roll_angle\)/g, 'getRoll()');
      
      // Replace button ternary pattern with false
      e = e.replace(/\(button\.pressed\(button\.([A-Z_]+)\)\s+if\s+hasattr\(button,\s+'\1'\)\s+else\s+\(button\.([a-z_]+)\.is_pressed\(\)\s+if\s+hasattr\(button,\s+'\2'\)\s+else\s+False\)\)/gi, 'false');
      
      // Support isinstance translations to typeof/isArray checks
      e = e.replace(/\bisinstance\(([^,]+),\s*Number\)/g, "typeof $1 === 'number'");
      e = e.replace(/\bisinstance\(([^,]+),\s*\(int,\s*float\)\)/g, "typeof $1 === 'number'");
      e = e.replace(/\bisinstance\(([^,]+),\s*str\)/g, "typeof $1 === 'string'");
      e = e.replace(/\bisinstance\(([^,]+),\s*list\)/g, "Array.isArray($1)");
      e = e.replace(/\bisinstance\(([^,]+),\s*dict\)/g, "(typeof $1 === 'object' && $1 !== null)");
      e = e.replace(/\bisinstance\(([^,]+),\s*bool\)/g, "typeof $1 === 'boolean'");

      // Generic Python ternary replacement: expr1 if cond else expr2 -> (cond ? expr1 : expr2)
      let prev;
      do {
        prev = e;
        e = e.replace(/\b([a-zA-Z0-9_.\(\)\[\]'"]+)\s+if\s+([a-zA-Z0-9_.\(\)\[\]!=<>, '"&|!]+)\s+else\s+([a-zA-Z0-9_.\(\)\[\]'"]+)\b/g, '($2 ? $1 : $3)');
      } while (e !== prev);
      
      // Gyro/tilt angles standard calls
      e = e.replace(/motion_sensor\.tilt_angles\(\)\[0\]/g, '(getYaw() * 10)');
      e = e.replace(/motion_sensor\.tilt_angles\(\)\[1\]/g, '(getPitch() * 10)');
      e = e.replace(/motion_sensor\.tilt_angles\(\)\[2\]/g, '(getRoll() * 10)');
      
      // Replace Python int and float with safe non-reserved JS parameter names
      e = e.replace(/\bint\b/g, 'py_int');
      e = e.replace(/\bfloat\b/g, 'py_float');
      
      return e;
    };

    // 3. Sostituzioni Statements Base
    const translateStatement = (stmt: string): string => {
      let s = stmt;
      
      // replace sleep/delays (standard and internal)
      s = s.replace(/await\s+runloop\.sleep_ms\((.*?)\)/g, 'await sleep($1)');
      s = s.replace(/await\s+custom_sleep\((.*?)\)/g, 'await sleep($1)');
      
      // replace drive pairs (standard & simulator-internal)
      s = s.replace(/await\s+_drive_pair_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'await drivePairForDegrees($1, $2, $3)');
      s = s.replace(/_drive_pair_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'drivePairForDegrees($1, $2, $3)');
      s = s.replace(/await\s+_drive_pair\((.*?),\s*(.*?)\)/g, 'await drivePair($1, $2)');
      s = s.replace(/_drive_pair\((.*?),\s*(.*?)\)/g, 'drivePair($1, $2)');
      s = s.replace(/_stop_pair\(\)/g, 'stopPair()');
      
      // replace light matrix (standard & simulator-internal)
      s = s.replace(/light_matrix\.write\((.*?)\)/g, 'writeLightMatrix($1)');
      s = s.replace(/_write_light_matrix\((.*?)\)/g, 'writeLightMatrix($1)');
      s = s.replace(/_write_text\((.*?)\)/g, 'writeLightMatrix($1)');
      s = s.replace(/light_matrix\.clear\(\)/g, 'clearLightMatrix()');
      s = s.replace(/_clear_light_matrix\(\)/g, 'clearLightMatrix()');
      s = s.replace(/_clear_matrix\(\)/g, 'clearLightMatrix()');
      s = s.replace(/light_matrix\.show_image\(light_matrix\.(.*?)\)/g, 'showImageLightMatrix("$1")');
      s = s.replace(/light_matrix\.show\(light_matrix\.(.*?)\)/g, 'showImageLightMatrix("$1")');
      s = s.replace(/_show_image_light_matrix\((.*?)\)/g, 'showImageLightMatrix($1)');
      s = s.replace(/_show_image\("(.*?)"\)/g, 'showImageLightMatrix("$1")');
      
      // replace sounds (standard & simulator-internal)
      s = s.replace(/sound\.beep\((.*?),\s*(.*?)\)/g, 'playNote($1, $2)');
      s = s.replace(/sound\.beep\(\)/g, 'beep()');
      s = s.replace(/_play_note\((.*?),\s*(.*?)\)/g, 'playNote($1, $2)');
      s = s.replace(/_beep\(\)/g, 'beep()');
      
      // replace motor controllers (standard & simulator-internal)
      s = s.replace(/await\s+motor\.run_for_degrees\(port\.(.*?),\s*(.*?),\s*(.*?)\)/g, 'await runMotorForDegrees("$1", $2, $3)');
      s = s.replace(/motor\.run\(port\.(.*?),\s*(.*?)\)/g, 'runMotor("$1", $2)');
      s = s.replace(/motor\.stop\(port\.(.*?)\)/g, 'stopMotor("$1")');
      
      s = s.replace(/_run_motor_for_degrees\((.*?),\s*(.*?),\s*(.*?)\)/g, 'runMotorForDegrees($1, $2, $3)');
      s = s.replace(/_run_motor\((.*?),\s*(.*?)\)/g, 'runMotor($1, $2)');
      s = s.replace(/_stop_motor\((.*?)\)/g, 'stopMotor($1)');
      
      // replace motion/gyro (standard & simulator-internal)
      s = s.replace(/motion_sensor\.reset_yaw\((.*?)\)/g, 'resetYaw($1)');
      s = s.replace(/_reset_yaw\((.*?)\)/g, 'resetYaw($1)');
      
      // print statement
      s = s.replace(/print\((.*?)\)/g, 'print($1)');

      // SAFE ASSIGNMENT CHECK
      // Match only when there is a valid variable name on the LHS, followed by a single '=' which is NOT part of '==', '!=', '>=', '<='
      const assignmentMatch = s.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^=].*)$/);
      if (assignmentMatch) {
        const lhs = assignmentMatch[1].trim();
        const rhs = assignmentMatch[2].trim();
        s = `${lhs} = ${translateExpression(rhs)}`;
      } else {
        s = translateExpression(s);
      }

      return s + (s.endsWith('}') || s.endsWith('{') ? '' : ';');
    };

    let jsCode = '';
    
    // Lo stack tiene traccia dei blocchi aperti
    const blockStack: { type: string, indent: number }[] = [];
    
    // 4. Scansione preliminare delle variabili per dichiarazione
    const varRegex = /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)\s*=[^=]/;
    const declaredVars = new Set<string>();
    const lines = strippedPython.split('\n');
    for (const line of lines) {
      const match = line.match(varRegex);
      if (match) {
        declaredVars.add(match[1]);
      }
    }
    const declarations = Array.from(declaredVars).map(v => `let ${v} = 0;`).join('\n') + (declaredVars.size > 0 ? '\n' : '');
    jsCode += declarations;

    // 5. Scansione del corpo linea per linea
    for (let i = 0; i < lines.length; i++) {
      const origLine = lines[i];
      const trimmed = origLine.trim();
      
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      const indent = origLine.length - origLine.trimStart().length;
      
      // Chiusura blocchi
      while (blockStack.length > 0) {
        const topBlock = blockStack[blockStack.length - 1];
        if (indent <= topBlock.indent) {
           const blockType = topBlock.type;
           const blockIndent = topBlock.indent;
           blockStack.pop();
           
           if (blockType === 'try') {
               if (indent === blockIndent && (trimmed.startsWith('except') || trimmed.startsWith('finally'))) {
                   jsCode += ' '.repeat(blockIndent) + '}\n';
               } else {
                   jsCode += ' '.repeat(blockIndent) + '} catch (e) {}\n';
               }
           } else if (blockType === 'while') {
               jsCode += ' '.repeat(blockIndent + 4) + 'await sleep(10);\n';
               jsCode += ' '.repeat(blockIndent) + '}\n';
           } else {
               jsCode += ' '.repeat(blockIndent) + '}\n';
           }
        } else {
           break;
        }
      }
      
      let translated = trimmed;
      let lineComment = '';
      const hashIndex = translated.indexOf('#');
      if (hashIndex !== -1) {
        lineComment = translated.substring(hashIndex);
        translated = translated.substring(0, hashIndex).trim();
      }
      
      // Control flows JS
      if (translated === 'while True:') {
        translated = 'while (true) {';
        blockStack.push({ type: 'while', indent: indent });
      } else if ((translated.startsWith('while ') || translated.startsWith('while(')) && translated.endsWith(':')) {
        const cond = translated.startsWith('while(') ? translated.substring(5, translated.length - 1) : translated.substring(6, translated.length - 1);
        translated = `while (${translateExpression(cond.trim())}) {`;
        blockStack.push({ type: 'while', indent: indent });
      } else if ((translated.startsWith('if ') || translated.startsWith('if(') || translated.startsWith('se ') || translated.startsWith('se(')) && translated.endsWith(':')) {
        let cond = '';
        if (translated.startsWith('if(')) cond = translated.substring(2, translated.length - 1);
        else if (translated.startsWith('if ')) cond = translated.substring(3, translated.length - 1);
        else if (translated.startsWith('se(')) cond = translated.substring(2, translated.length - 1);
        else cond = translated.substring(3, translated.length - 1);
        translated = `if (${translateExpression(cond.trim())}) {`;
        blockStack.push({ type: 'if', indent: indent });
      } else if ((translated.startsWith('elif ') || translated.startsWith('elif(')) && translated.endsWith(':')) {
        const cond = translated.startsWith('elif(') ? translated.substring(4, translated.length - 1) : translated.substring(5, translated.length - 1);
        translated = `else if (${translateExpression(cond.trim())}) {`;
        blockStack.push({ type: 'if', indent: indent });
      } else if (translated === 'else:') {
        translated = 'else {';
        blockStack.push({ type: 'if', indent: indent });
      } else if (translated.startsWith('async def ') && translated.endsWith(':')) {
        const funcHeader = translated.substring(10, translated.length - 1);
        translated = `async function ${funcHeader} {`;
        blockStack.push({ type: 'def', indent: indent });
      } else if (translated.startsWith('def ') && translated.endsWith(':')) {
        const funcHeader = translated.substring(4, translated.length - 1);
        translated = `function ${funcHeader} {`;
        blockStack.push({ type: 'def', indent: indent });
      } else if (translated.startsWith('for ') && translated.endsWith(':')) {
        const forRangeMatch = translated.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+range\((.*)\)\s*:$/);
        if (forRangeMatch) {
          const varName = forRangeMatch[1];
          const rangeArgsStr = forRangeMatch[2].trim();
          const args = rangeArgsStr.split(',').map(a => a.trim());
          let start = '0', stop = '0', step = '1';
          if (args.length === 1) stop = translateExpression(args[0]);
          else if (args.length === 2) { start = translateExpression(args[0]); stop = translateExpression(args[1]); }
          else if (args.length === 3) { start = translateExpression(args[0]); stop = translateExpression(args[1]); step = translateExpression(args[2]); }
          const isNegativeStep = step.startsWith('-') || parseInt(step) < 0;
          const cmp = isNegativeStep ? '>' : '<';
          const increment = step === '1' ? `${varName}++` : (step === '-1' ? `${varName}--` : `${varName} += ${step}`);
          translated = `for (let ${varName} = ${start}; ${varName} ${cmp} ${stop}; ${increment}) {`;
        } else {
          const forInMatch = translated.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.*)\s*:$/);
          if (forInMatch) {
            const varName = forInMatch[1];
            const iterable = translateExpression(forInMatch[2].trim());
            translated = `for (let ${varName} of ${iterable}) {`;
          }
        }
        blockStack.push({ type: 'for', indent: indent });
      } else if (translated === 'try:') {
        translated = 'try {';
        blockStack.push({ type: 'try', indent: indent });
      } else if (translated.startsWith('except') && translated.endsWith(':')) {
        translated = 'catch (e) {';
        blockStack.push({ type: 'except', indent: indent });
      } else if (translated === 'finally:') {
        translated = 'finally {';
        blockStack.push({ type: 'finally', indent: indent });
      } else if (translated.startsWith('try: ')) {
        const stmt = translated.substring(5).trim();
        translated = `try { ${translateStatement(stmt)}`;
        blockStack.push({ type: 'try', indent: indent });
      } else if (translated === 'pass') {
        translated = '// pass';
      } else if (translated.startsWith('global ')) {
        translated = '// global ' + translated.substring(7);
      } else if (translated.startsWith('import ') || translated.startsWith('from ')) {
        translated = '// ' + translated;
      } else if (translated.startsWith('raise ')) {
        translated = 'throw new Error(String(' + translated.substring(6) + '));';
      } else {
        translated = translateStatement(translated);
      }
      
      jsCode += ' '.repeat(indent) + translated + (lineComment ? ' ' + lineComment.replace('#', '//') : '') + '\n';
    }
    
    // 6. Svuota lo Stack residuo a fine file
    while (blockStack.length > 0) {
      const topBlock = blockStack.pop();
      if (!topBlock) break;
      const { type: blockType, indent: blockIndent } = topBlock;
      
      if (blockType === 'try') {
        jsCode += ' '.repeat(blockIndent) + '} catch (e) {}\n';
      } else if (blockType === 'while') {
        jsCode += ' '.repeat(blockIndent + 4) + 'await sleep(10);\n';
        jsCode += ' '.repeat(blockIndent) + '}\n';
      } else {
        jsCode += ' '.repeat(blockIndent) + '}\n';
      }
    }
    
    console.log("Transpiled JS code:\n", jsCode);
    return jsCode;
  };

  // Extract user code block between lego templates
  const extractUserCode = (fullCode: string) => {
    const startMarker = '# === START_BLOCKLY_CODE ===';
    const endMarker = '# === END_BLOCKLY_CODE ===';
    const startIndex = fullCode.indexOf(startMarker);
    const endIndex = fullCode.indexOf(endMarker);
    
    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      return fullCode.substring(startIndex + startMarker.length, endIndex).trim();
    }
    return fullCode;
  };

  // Run the code in the simulator
  const runSimulationCode = async () => {
    // Clear trail when starting code execution
    if (robotRef.current) {
      robotRef.current.trail = [];
    }

    if (isRunningCode) {
      stopSimulationCode();
      await new Promise(r => setTimeout(r, 150));
    }

    setConsoleLogs([]);
    const userBlock = extractUserCode(code);
    if (!userBlock || userBlock.length === 0) {
      setConsoleLogs(['[Simulatore] Nessun codice utente da eseguire. Crea dei blocchi prima.']);
      return;
    }

    const jsCode = transpilePythonToJs(userBlock);
    console.log("Transpiled JS code:\n", jsCode);
    setConsoleLogs(prev => [...prev, '[Simulatore] Codice caricato e compilato con successo.']);
    
    setIsRunningCode(true);
    setIsPlaying(true);

    const execId = ++activeExecutionId.current;

    // Simulation SDK mapping
    const sleep = (ms: number) => {
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (execId !== activeExecutionId.current) {
            reject(new Error('Interrupted'));
          } else {
            resolve();
          }
        }, ms);
      });
    };

    const drivePair = (steering: number, velocity: number) => {
      if (execId !== activeExecutionId.current) return;
      
      // Handle inverse speeds or steering calculations
      let speedL = velocity;
      let speedR = velocity;
      
      if (steering > 0) {
        speedR = Math.round(velocity * (50 - steering) / 50);
      } else if (steering < 0) {
        speedL = Math.round(velocity * (50 + steering) / 50);
      }

      // Scaling down speed values to match virtual pixels/second (using 800/240 pixels per cm, divided by 10)
      const K_speed = (((Math.PI * (wheelDiameter || 5.6)) / 6480) * (800 / 240)) / 10;
      robotRef.current.leftSpeed = speedL * K_speed;
      robotRef.current.rightSpeed = speedR * K_speed;
    };

    const drivePairForDegrees = async (degrees: number, steering: number, velocity: number) => {
      if (execId !== activeExecutionId.current) return;
      drivePair(steering, velocity);
      
      // Calculate delay needed based on wheel specifications
      const avgSpeed = Math.abs(velocity) || 1;
      // Rough estimation: time = degrees / speed scale (multiplied by 10 because speed is divided by 10)
      const durationMs = (Math.abs(degrees) / avgSpeed) * 3000;
      await sleep(durationMs);
      stopPair();
    };

    const stopPair = () => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.leftSpeed = 0;
      robotRef.current.rightSpeed = 0;
    };

    const runMotor = (port: string, speed: number) => {
      if (execId !== activeExecutionId.current) return;
      // Individual motor control
      const K_speed = (((Math.PI * (wheelDiameter || 5.6)) / 6480) * (800 / 240)) / 10;
      const scaledSpeed = speed * K_speed;
      if (port === 'A' || port === 'C') {
        robotRef.current.leftSpeed = scaledSpeed;
      } else {
        robotRef.current.rightSpeed = scaledSpeed;
      }
    };

    const stopMotor = (port: string) => {
      if (execId !== activeExecutionId.current) return;
      if (port === 'A' || port === 'C') {
        robotRef.current.leftSpeed = 0;
      } else {
        robotRef.current.rightSpeed = 0;
      }
    };

    const runMotorForDegrees = async (port: string, degrees: number, speed: number) => {
      if (execId !== activeExecutionId.current) return;
      runMotor(port, speed);
      const durationMs = (Math.abs(degrees) / (Math.abs(speed) || 1)) * 3000;
      await sleep(durationMs);
      stopMotor(port);
    };

    const writeLightMatrix = (text: any) => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.matrixText = String(text);
      robotRef.current.matrixImage = '';
      setConsoleLogs(prev => [...prev, `[Schermo] Testo: "${text}"`]);
    };

    const clearLightMatrix = () => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.matrixText = '';
      robotRef.current.matrixImage = '';
    };

    const showImageLightMatrix = (imageName: string) => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.matrixText = '';
      robotRef.current.matrixImage = imageName;
      setConsoleLogs(prev => [...prev, `[Schermo] Mostrata immagine: ${imageName}`]);
    };

    const playNote = (note: number, duration: number) => {
      if (execId !== activeExecutionId.current) return;
      triggerBeep(note, duration);
    };

    const beep = () => {
      if (execId !== activeExecutionId.current) return;
      triggerBeep(880, 150);
    };

    const resetYaw = (angle = 0) => {
      if (execId !== activeExecutionId.current) return;
      robotRef.current.yawResetAngle = robotRef.current.angle - (angle / 10);
    };

    const getYaw = () => {
      let relative = robotRef.current.angle - robotRef.current.yawResetAngle;
      // normalize -180 to 180 using mathematically correct modulo
      relative = ((((relative + 180) % 360) + 360) % 360) - 180;
      return Math.round(relative);
    };

    const getPitch = () => 0;
    const getRoll = () => 0;

    const getColor = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'color') {
        return reading.color;
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'color') as any;
      return fallback ? fallback.color : -1;
    };

    const getReflection = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'color') {
        return reading.reflection;
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'color') as any;
      return fallback ? fallback.reflection : 0;
    };

    const getDistance = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'distance') {
        return Math.round(reading.distance);
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'distance') as any;
      return fallback ? Math.round(fallback.distance) : 200;
    };

    const getForce = (port: string) => {
      const p = String(port).toUpperCase();
      const reading = sensorReadingsRef.current[p];
      if (reading && reading.type === 'force') {
        return reading.force > 0 ? 100 : 0;
      }
      const fallback = Object.values(sensorReadingsRef.current).find((r: any) => r.type === 'force') as any;
      return fallback ? (fallback.force > 0 ? 100 : 0) : 0;
    };

    const print = (text: any) => {
      setConsoleLogs(prev => [...prev, `[Print] ${String(text)}`]);
    };

    // Create Async Context Execution
    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      
      const py_int = (val: any) => {
        const num = Number(val);
        return isNaN(num) ? 0 : Math.trunc(num);
      };
      const py_float = (val: any) => {
        const num = Number(val);
        return isNaN(num) ? 0.0 : num;
      };
      const py_str = (val: any) => String(val);
      const py_len = (val: any) => {
        if (val === null || val === undefined) return 0;
        if (typeof val.length === 'number') return val.length;
        if (typeof val.size === 'number') return val.size;
        return String(val).length;
      };
      const py_abs = (val: any) => Math.abs(Number(val));
      const py_round = (val: any, decimals: number = 0) => {
        const factor = Math.pow(10, decimals);
        return Math.round(Number(val) * factor) / factor;
      };
      const py_min = (...args: any[]) => {
        if (args.length === 1 && Array.isArray(args[0])) {
          return Math.min(...args[0].map(Number));
        }
        return Math.min(...args.map(Number));
      };
      const py_max = (...args: any[]) => {
        if (args.length === 1 && Array.isArray(args[0])) {
          return Math.max(...args[0].map(Number));
        }
        return Math.max(...args.map(Number));
      };

      const py_randint = (from: any, to: any) => {
        const min = Math.ceil(Number(from));
        const max = Math.floor(Number(to));
        return Math.floor(Math.random() * (max - min + 1)) + min;
      };

      const randomMock = {
        randint: py_randint,
        random: () => Math.random(),
        uniform: (from: any, to: any) => Math.random() * (Number(to) - Number(from)) + Number(from),
        choice: (seq: any) => {
          if (!seq || seq.length === 0) return null;
          return seq[Math.floor(Math.random() * seq.length)];
        }
      };

      const mathMock = {
        sqrt: (val: any) => Math.sqrt(Number(val)),
        sin: (val: any) => Math.sin(Number(val)),
        cos: (val: any) => Math.cos(Number(val)),
        tan: (val: any) => Math.tan(Number(val)),
        asin: (val: any) => Math.asin(Number(val)),
        acos: (val: any) => Math.acos(Number(val)),
        atan: (val: any) => Math.atan(Number(val)),
        sinh: (val: any) => Math.sinh(Number(val)),
        cosh: (val: any) => Math.cosh(Number(val)),
        tanh: (val: any) => Math.tanh(Number(val)),
        log: (val: any, base?: any) => base !== undefined ? Math.log(Number(val)) / Math.log(Number(base)) : Math.log(Number(val)),
        log10: (val: any) => Math.log10(Number(val)),
        exp: (val: any) => Math.exp(Number(val)),
        pow: (val: any, p: any) => Math.pow(Number(val), Number(p)),
        ceil: (val: any) => Math.ceil(Number(val)),
        floor: (val: any) => Math.floor(Number(val)),
        fabs: (val: any) => Math.abs(Number(val)),
        degrees: (val: any) => Number(val) * 180 / Math.PI,
        radians: (val: any) => Number(val) * Math.PI / 180,
        pi: Math.PI,
        PI: Math.PI,
        e: Math.E,
        E: Math.E,
      };

      const buttonMock = {
        pressed: () => false,
        LEFT: 'LEFT',
        RIGHT: 'RIGHT',
        CENTER: 'CENTER',
        power: { is_pressed: () => false },
        center: { is_pressed: () => false },
        left: { is_pressed: () => false },
        right: { is_pressed: () => false },
      };
      
      const lightMatrixMock = {
        HAPPY: 'IMAGE_HAPPY',
        IMAGE_HAPPY: 'IMAGE_HAPPY',
        HEART: 'IMAGE_HEART',
        IMAGE_HEART: 'IMAGE_HEART',
        YES: 'IMAGE_YES',
        IMAGE_YES: 'IMAGE_YES',
        NO: 'IMAGE_NO',
        IMAGE_NO: 'IMAGE_NO',
        SMILE: 'IMAGE_SMILE',
        IMAGE_SMILE: 'IMAGE_SMILE',
        SAD: 'IMAGE_SAD',
        IMAGE_SAD: 'IMAGE_SAD',
        ANGRY: 'IMAGE_ANGRY',
        IMAGE_ANGRY: 'IMAGE_ANGRY',
        SURPRISED: 'IMAGE_SURPRISED',
        IMAGE_SURPRISED: 'IMAGE_SURPRISED',
        ARROW_N: 'IMAGE_ARROW_N',
        IMAGE_ARROW_N: 'IMAGE_ARROW_N',
        ARROW_S: 'IMAGE_ARROW_S',
        IMAGE_ARROW_S: 'IMAGE_ARROW_S',
        ARROW_E: 'IMAGE_ARROW_E',
        IMAGE_ARROW_E: 'IMAGE_ARROW_E',
        ARROW_W: 'IMAGE_ARROW_W',
        IMAGE_ARROW_W: 'IMAGE_ARROW_W',
        write: (text: any) => writeLightMatrix(text),
        clear: () => clearLightMatrix(),
        show_image: (img: any) => showImageLightMatrix(img)
      };

      const hasattrMock = (obj: any, prop: string) => obj && prop in obj;

      const runnerFn = new AsyncFunction(
        'sleep', 'drivePair', 'drivePairForDegrees', 'stopPair',
        'writeLightMatrix', 'clearLightMatrix', 'showImageLightMatrix',
        'playNote', 'beep', 'runMotor', 'stopMotor', 'runMotorForDegrees',
        'resetYaw', 'getColor', 'getReflection', 'getDistance', 'getForce',
        'getYaw', 'getPitch', 'getRoll', 'print',
        'py_int', 'py_float', 'py_str', 'py_len', 'py_abs', 'py_round', 'py_min', 'py_max',
        'str', 'len', 'abs', 'round', 'min', 'max',
        'button', 'light_matrix', 'hasattr', 'random', 'randint', 'math',
        `try {
          ${jsCode}
        } catch(e) {
          if (e.message !== 'Interrupted') {
             throw e;
          }
        }`
      );

      await runnerFn(
        sleep, drivePair, drivePairForDegrees, stopPair,
        writeLightMatrix, clearLightMatrix, showImageLightMatrix,
        playNote, beep, runMotor, stopMotor, runMotorForDegrees,
        resetYaw, getColor, getReflection, getDistance, getForce,
        getYaw, getPitch, getRoll, print,
        py_int, py_float, py_str, py_len, py_abs, py_round, py_min, py_max,
        py_str, py_len, py_abs, py_round, py_min, py_max,
        buttonMock, lightMatrixMock, hasattrMock, randomMock, py_randint, mathMock
      );

      setConsoleLogs(prev => [...prev, '[Simulatore] Esecuzione completata.']);
    } catch (err: any) {
      if (err.message !== 'Interrupted') {
        console.error("Simulation run error:", err);
        setConsoleLogs(prev => [...prev, `[Errore Simulazione] ${err.message}\n===JSCODE===\n${jsCode}\n===ENDJSCODE===`]);
      }
    } finally {
      if (execId === activeExecutionId.current) {
        setIsRunningCode(false);
        setIsPlaying(false);
        robotRef.current.leftSpeed = 0;
        robotRef.current.rightSpeed = 0;
      }
    }
  };

  const stopSimulationCode = () => {
    activeExecutionId.current++; // Invalidates active running promise
    setIsRunningCode(false);
    robotRef.current.leftSpeed = 0;
    robotRef.current.rightSpeed = 0;
    setConsoleLogs(prev => [...prev, '[Simulatore] Esecuzione interrotta.']);
  };

  const getSensorLocalCoords = (sensor: any, idx: number, displaySensors: any[]): { localX: number; localY: number } => {
    const colorSensors = displaySensors.filter(s => s.type === 'color');
    const forceSensors = displaySensors.filter(s => s.type === 'force');
    const distanceSensors = displaySensors.filter(s => s.type === 'distance');

    const hasTwoColors = colorSensors.length === 2;
    const hasForce = forceSensors.length > 0;
    const hasDistance = distanceSensors.length > 0;

    if (sensor.type === 'color') {
      if (hasTwoColors) {
        const colorIdx = colorSensors.findIndex(s => s.port === sensor.port);
        return { localX: 25, localY: colorIdx === 0 ? -12 : 12 };
      }
      return { localX: 25, localY: (hasForce || hasDistance) ? -16 : 0 };
    }

    if (sensor.type === 'force') {
      const forceIdx = forceSensors.findIndex(s => s.port === sensor.port);
      if (forceSensors.length === 1) return { localX: 25, localY: 0 };
      const spread = 12;
      return { localX: 25, localY: -spread / 2 + (forceIdx / (forceSensors.length - 1)) * spread };
    }

    if (sensor.type === 'distance') {
      const distIdx = distanceSensors.findIndex(s => s.port === sensor.port);
      if (distanceSensors.length === 1) return { localX: 28, localY: 0 };
      const spread = 12;
      return { localX: 28, localY: -spread / 2 + (distIdx / (distanceSensors.length - 1)) * spread };
    }

    return { localX: 28, localY: 0 };
  };

  const updateLedScreenTexture = (text: string, img: string, isBeep: boolean) => {
    const t = threeRef.current;
    if (!t) return;
    const ctx = t.ledCanvas.getContext('2d');
    if (!ctx) return;

    const width = t.ledCanvas.width;
    const height = t.ledCanvas.height;

    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, width, height);

    if (text) {
      ctx.fillStyle = '#ff3333';
      
      // Calculate font size dynamically to fit the text perfectly
      let fontSize = Math.floor(height * 0.4);
      ctx.font = `bold ${fontSize}px monospace`;
      let textWidth = ctx.measureText(text).width;
      
      if (textWidth > width * 0.9) {
        fontSize = Math.floor(fontSize * (width * 0.9) / textWidth);
        fontSize = Math.max(fontSize, Math.floor(height * 0.12)); // Safeguard minimum size
      }
      
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height / 2);
    } else if (img) {
      ctx.fillStyle = '#ff3333';
      const name = img.toUpperCase();
      const scale = width / 64;
      if (name.includes('HAPPY') || name.includes('SMILE')) {
        ctx.fillRect(16 * scale, 16 * scale, 8 * scale, 8 * scale);
        ctx.fillRect(40 * scale, 16 * scale, 8 * scale, 8 * scale);
        ctx.beginPath();
        ctx.arc(32 * scale, 36 * scale, 14 * scale, 0, Math.PI);
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 4 * scale;
        ctx.stroke();
      } else if (name.includes('HEART')) {
        ctx.fillRect(28 * scale, 40 * scale, 8 * scale, 8 * scale);
        ctx.fillRect(20 * scale, 28 * scale, 24 * scale, 12 * scale);
        ctx.fillRect(16 * scale, 20 * scale, 12 * scale, 8 * scale);
        ctx.fillRect(36 * scale, 20 * scale, 12 * scale, 8 * scale);
      } else {
        ctx.fillRect(28 * scale, 28 * scale, 8 * scale, 8 * scale);
      }
    } else if (isBeep) {
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 4 * (width / 64);
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 20 * (width / 64), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#331111';
      const step = width / 5.33; // roughly 12 for 64
      const size = width / 21.3; // roughly 3 for 64
      for (let x = width / 8; x < width; x += step) {
        for (let y = height / 8; y < height; y += step) {
          ctx.fillRect(x, y, size, size);
        }
      }
    }
    t.ledTexture.needsUpdate = true;
  };

  const update3DSensors = (displaySensors: any[], currentReadings: any) => {
    const t = threeRef.current;
    if (!t) return;
    
    while (t.sensorGroup.children.length > 0) {
      t.sensorGroup.remove(t.sensorGroup.children[0]);
    }

    displaySensors.forEach((sensor, idx) => {
      const { localX, localY } = getSensorLocalCoords(sensor, idx, displaySensors);
      const reading = currentReadings[sensor.port.toUpperCase()];
      const singleSensorGroup = new THREE.Group();
      let sensorHeight = 8;
      if (sensor.type === 'distance') {
        sensorHeight = 21; // Alzato ulteriormente per evitare sovrapposizioni
      } else if (sensor.type === 'force') {
        sensorHeight = 5; // Abbassato ulteriormente per evitare sovrapposizioni
      }
      singleSensorGroup.position.set(localX, sensorHeight, localY);

      if (sensor.type === 'color') {
        const casingGeo = new THREE.CylinderGeometry(4, 4, 8, 16);
        const casingMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 });
        const casing = new THREE.Mesh(casingGeo, casingMat);
        if (sensor.direction === 'forward') casing.rotation.z = -Math.PI / 2;
        singleSensorGroup.add(casing);

        const activeColor = reading ? reading.colorHex : '#cccccc';
        const lensGeo = new THREE.CylinderGeometry(3.2, 3.2, 1, 16);
        const lensMat = new THREE.MeshStandardMaterial({
          color: activeColor,
          emissive: activeColor,
          emissiveIntensity: 0.6,
          roughness: 0.1
        });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.y = sensor.direction === 'forward' ? 0 : -4.1;
        if (sensor.direction === 'forward') {
          lens.rotation.z = -Math.PI / 2;
          lens.position.x = 4.1;
        }
        singleSensorGroup.add(lens);

        if (sensor.direction === 'forward') {
          const helperGeo = new THREE.CylinderGeometry(3, 0.1, 16, 8);
          const helperMat = new THREE.MeshBasicMaterial({
            color: activeColor,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
          });
          const helper = new THREE.Mesh(helperGeo, helperMat);
          helper.rotation.z = -Math.PI / 2;
          helper.position.set(12, 0, 0);
          singleSensorGroup.add(helper);
        }
      } else if (sensor.type === 'distance') {
        // Corpo bicolore Lego Spike Prime per il sensore a ultrasuoni (bianco davanti, nero dietro)
        const whiteBoxGeo = new THREE.BoxGeometry(4.5, 10, 14);
        const whiteBoxMat = new THREE.MeshStandardMaterial({ color: 0xfcfcfc, roughness: 0.4 });
        const whiteBox = new THREE.Mesh(whiteBoxGeo, whiteBoxMat);
        whiteBox.position.set(0.75, 0, 0);
        singleSensorGroup.add(whiteBox);

        const blackBoxGeo = new THREE.BoxGeometry(1.5, 10, 14);
        const blackBoxMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
        const blackBox = new THREE.Mesh(blackBoxGeo, blackBoxMat);
        blackBox.position.set(-2.25, 0, 0);
        singleSensorGroup.add(blackBox);

        // Mascherina nera sul davanti (come gli occhiali del sensore originale)
        const frontPlateGeo = new THREE.BoxGeometry(0.1, 7.5, 11);
        const frontPlateMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        const frontPlate = new THREE.Mesh(frontPlateGeo, frontPlateMat);
        frontPlate.position.set(3.01, 0, 0);
        singleSensorGroup.add(frontPlate);

        // Anelli metallici esterni dei due "occhi" a ultrasuoni (color argento/grigio)
        const ringGeo = new THREE.CylinderGeometry(2, 2, 0.5, 24);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.2 });
        const leftRing = new THREE.Mesh(ringGeo, ringMat);
        leftRing.rotation.z = -Math.PI / 2;
        leftRing.position.set(3.1, 0, -3.2);
        singleSensorGroup.add(leftRing);

        const rightRing = leftRing.clone();
        rightRing.position.set(3.1, 0, 3.2);
        singleSensorGroup.add(rightRing);

        // Parte interna nera degli occhi (i trasduttori veri e propri)
        const eyeGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.6, 24);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.rotation.z = -Math.PI / 2;
        leftEye.position.set(3.2, 0, -3.2);
        singleSensorGroup.add(leftEye);

        const rightEye = leftEye.clone();
        rightEye.position.set(3.2, 0, 3.2);
        singleSensorGroup.add(rightEye);

        // Cono di proiezione/beam del sensore
        const distCm = reading ? reading.distance : 200;
        const distUnits = distCm * (800 / 240);
        if (distUnits > 0) {
          const beamGeo = new THREE.CylinderGeometry(distUnits * 0.1, 0.5, distUnits, 8);
          const beamMat = new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
          });
          const beam = new THREE.Mesh(beamGeo, beamMat);
          beam.rotation.z = -Math.PI / 2;
          beam.position.set(distUnits / 2 + 3, 0, 0);
          singleSensorGroup.add(beam);
        }
      } else if (sensor.type === 'force') {
        const baseGeo = new RoundedBoxGeometry(4, 8, 8, 2, 1);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        singleSensorGroup.add(base);

        const plungerGeo = new RoundedBoxGeometry(3, 6, 6, 2, 0.5);
        const plungerMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 });
        const plunger = new THREE.Mesh(plungerGeo, plungerMat);
        const isPressed = reading && reading.force > 0;
        plunger.position.set(isPressed ? 2.1 : 3.0, 0, 0);
        singleSensorGroup.add(plunger);
      }
      t.sensorGroup.add(singleSensorGroup);
    });
  };

  const syncObstacles3D = (obstaclesList: Obstacle[], selectedId: number | null) => {
    const t = threeRef.current;
    if (!t) return;

    const activeIds = new Set(obstaclesList.map(o => o.id));
    for (let id of Array.from(t.obstacleMeshes.keys()) as number[]) {
      if (!activeIds.has(id)) {
        const mesh = t.obstacleMeshes.get(id);
        if (mesh) {
          t.scene.remove(mesh);
          mesh.traverse((child: any) => {
            if (child.isMesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }
        t.obstacleMeshes.delete(id);
      }
    }

    obstaclesList.forEach(obs => {
      let obstacleGroup = t.obstacleMeshes.get(obs.id);
      
      if (obstacleGroup) {
        const ud = obstacleGroup.userData || {};
        if (
          ud.w !== obs.w ||
          ud.h !== obs.h ||
          ud.shape !== obs.shape ||
          ud.color !== obs.color ||
          ud.pushable !== obs.pushable
        ) {
          t.scene.remove(obstacleGroup);
          obstacleGroup.traverse((child: any) => {
            if (child.isMesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
          t.obstacleMeshes.delete(obs.id);
          obstacleGroup = undefined;
        }
      }

      const isSelected = obs.id === selectedId;
      const height = 34; // increased by 3cm (10 units)
      const isCircle = obs.shape === 'circle';

      if (!obstacleGroup) {
        obstacleGroup = new THREE.Group();
        obstacleGroup.userData = {
          w: obs.w,
          h: obs.h,
          shape: obs.shape,
          color: obs.color,
          pushable: obs.pushable
        };
        let coreMesh: THREE.Mesh;
        if (isCircle) {
          const radius = obs.w / 2;
          const cylGeo = new THREE.CylinderGeometry(radius, radius, height, 24);
          const cylMat = new THREE.MeshStandardMaterial({
            color: obs.color ? new THREE.Color(obs.color) : (obs.pushable ? 0xd97706 : 0x4b5563),
            roughness: 0.6,
            metalness: obs.pushable ? 0.2 : 0.6
          });
          coreMesh = new THREE.Mesh(cylGeo, cylMat);
          coreMesh.position.y = height / 2;
          coreMesh.castShadow = true;
          coreMesh.receiveShadow = true;
          obstacleGroup.add(coreMesh);

          if (obs.pushable) {
            // Rimosse le bande decorative nere per mostrare il colore pulito dell'oggetto cilindrico
          } else {
            const trimGeo = new THREE.CylinderGeometry(radius + 0.5, radius + 0.5, 2, 24);
            const trimMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 });
            const trimTop = new THREE.Mesh(trimGeo, trimMat);
            trimTop.position.y = height - 1;
            obstacleGroup.add(trimTop);
          }
        } else {
          const boxGeo = new THREE.BoxGeometry(obs.w, height, obs.h);
          const boxMat = new THREE.MeshStandardMaterial({
            color: obs.color ? new THREE.Color(obs.color) : (obs.pushable ? 0xd97706 : 0x4b5563),
            roughness: 0.7,
            metalness: obs.pushable ? 0.1 : 0.5
          });
          coreMesh = new THREE.Mesh(boxGeo, boxMat);
          coreMesh.position.y = height / 2;
          coreMesh.castShadow = true;
          coreMesh.receiveShadow = true;
          obstacleGroup.add(coreMesh);

          if (obs.pushable) {
            // Rimosse le assi di legno decorative a forma di Z
          } else {
            const grooveGeo = new THREE.BoxGeometry(obs.w + 0.2, 0.8, obs.h + 0.2);
            const grooveMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });
            const groove = new THREE.Mesh(grooveGeo, grooveMat);
            groove.position.y = height / 2;
            obstacleGroup.add(groove);
          }
        }

        const ringGeo = isCircle
          ? new THREE.RingGeometry(obs.w / 2 + 2, obs.w / 2 + 4, 32)
          : new THREE.RingGeometry(Math.max(obs.w, obs.h) / 2 + 2, Math.max(obs.w, obs.h) / 2 + 4, 4);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = 'selectionRing';
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.5;
        obstacleGroup.add(ring);

        t.scene.add(obstacleGroup);
        t.obstacleMeshes.set(obs.id, obstacleGroup);
      }

      obstacleGroup.position.set(obs.x + obs.w / 2 - 400, 0, obs.y + obs.h / 2 - 190);
      const ring = obstacleGroup.getObjectByName('selectionRing') as THREE.Mesh;
      if (ring && ring.material) {
        (ring.material as THREE.Material).opacity = isSelected ? 0.8 : 0;
      }
    });
  };

  // Helper to draw background paths on offscreen canvas for color reading
  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, forReading: boolean) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Draw grid if not for sensor reading
    if (!forReading) {
      ctx.strokeStyle = '#F0F0F0';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    if (mapType === 'line') {
      // Draw a line track
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      // Round loop track - Shifted 17px (approx 5cm) up
      ctx.moveTo(130, 118);
      ctx.bezierCurveTo(350, 43, 500, 43, 650, 118);
      ctx.bezierCurveTo(750, 183, 750, 263, 650, 298);
      ctx.bezierCurveTo(500, 353, 350, 353, 130, 298);
      ctx.bezierCurveTo(50, 263, 50, 183, 130, 118);
      ctx.stroke();

    } else if (mapType === 'colors') {
      // Draw massive colored areas for reading
      const colors = [
        { hex: '#EF4444', name: language === 'en' ? 'Red' : 'Rosso', x: 220, y: 70 },
        { hex: '#22C55E', name: language === 'en' ? 'Green' : 'Verde', x: 380, y: 70 },
        { hex: '#3B82F6', name: language === 'en' ? 'Blue' : 'Blu', x: 540, y: 70 },
        { hex: '#EAB308', name: language === 'en' ? 'Yellow' : 'Giallo', x: 220, y: 230 },
        { hex: '#000000', name: language === 'en' ? 'Black' : 'Nero', x: 380, y: 230 },
        { hex: '#A855F7', name: language === 'en' ? 'None/Purple' : 'Nessuno/Viola', x: 540, y: 230 },
      ];

      colors.forEach(col => {
        ctx.fillStyle = col.hex;
        ctx.fillRect(col.x, col.y, 110, 110);
        
        if (!forReading) {
          ctx.fillStyle = '#111111';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(col.name, col.x + 10, col.y + 25);
        }
      });
    } else if (mapType === 'maze') {
      // Target area in green
      ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.fillRect(680, 280, 100, 100);
      if (!forReading) {
        ctx.fillStyle = '#15803D';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('TRAGUARDO', 690, 335);
      }
    } else if (mapType === 'custom') {
      if (customBgImage) {
        ctx.drawImage(customBgImage, 0, 0, width, height);
      } else if (!forReading) {
        ctx.save();
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(40, 40, width - 80, height - 80);
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#a1a1aa';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nessuna immagine di sfondo caricata.', width / 2, height / 2 - 10);
        
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#71717a';
        ctx.fillText(language === 'en' ? 'Click "Load Texture" above to select an image from your computer.' : 'Clicca su "Carica Sfondo" in alto per selezionare un\'immagine dal computer.', width / 2, height / 2 + 15);
        ctx.restore();
      }
    }
  };

  // Main simulation render & update loop in 3D using Three.js
  useEffect(() => {
    let animId;

    const canvas = canvasRef.current;
    const offscreen = offscreenCanvasRef.current;
    if (!canvas || !offscreen) return;

    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;

    const W = 800;
    const H = 380;

    // Draw background on offscreen immediately for 3D floor texture (with grid and labels)
    offscreen.width = W;
    offscreen.height = H;
    drawBackground(offCtx, W, H, false); // forReading = false (shows grid/labels)

    // Separate canvas for sensor readings to prevent reading gridlines/labels
    const offscreenSensor = document.createElement('canvas');
    offscreenSensor.width = W;
    offscreenSensor.height = H;
    const offCtxSensor = offscreenSensor.getContext('2d', { willReadFrequently: true });
    if (offCtxSensor) {
      drawBackground(offCtxSensor, W, H, true); // forReading = true (no grid/labels)
    }
    const sensorContext = offCtxSensor || offCtx;

    // Initialize Three.js if not yet initialized
    if (!threeRef.current) {
      const scene = new THREE.Scene();
      
      // Camera
      const camera = new THREE.PerspectiveCamera(40, W / H, 1, 3000);
      camera.position.set(0, 320, 420);
      
      // Renderer
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.01; // prevent camera going below floor
      controls.minDistance = 80;
      controls.maxDistance = 1200;
      controls.target.set(0, 0, 0);
      
      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      scene.add(ambientLight);
      
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
      dirLight.position.set(150, 350, 200);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 1000;
      const d = 450;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      scene.add(dirLight);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x333333, 0.4);
      hemiLight.position.set(0, 500, 0);
      scene.add(hemiLight);
      
      // Floor
      const floorTex = new THREE.CanvasTexture(offscreen);
      floorTex.colorSpace = THREE.SRGBColorSpace;
      const floorGeo = new THREE.PlaneGeometry(800, 380);
      const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      
      // 5 cm high walls = 16.67 units high
      const wallHeight = 16.67;
      const wallThickness = 8;
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.5,
        metalness: 0.8,
      });
      const stripeMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
      });

      const wallsGroup = new THREE.Group();

      // Top wall (along X, at Z = -190)
      const topWallGeo = new THREE.BoxGeometry(800 + wallThickness, wallHeight, wallThickness);
      const topWall = new THREE.Mesh(topWallGeo, wallMat);
      topWall.position.set(0, wallHeight / 2, -190 - wallThickness / 2);
      topWall.castShadow = true;
      topWall.receiveShadow = true;
      wallsGroup.add(topWall);

      // Bottom wall (along X, at Z = 190)
      const bottomWallGeo = new THREE.BoxGeometry(800 + wallThickness, wallHeight, wallThickness);
      const bottomWall = new THREE.Mesh(bottomWallGeo, wallMat);
      bottomWall.position.set(0, wallHeight / 2, 190 + wallThickness / 2);
      bottomWall.castShadow = true;
      bottomWall.receiveShadow = true;
      wallsGroup.add(bottomWall);

      // Left wall (along Z, at X = -400)
      const leftWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 380 + wallThickness * 2);
      const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
      leftWall.position.set(-400 - wallThickness / 2, wallHeight / 2, 0);
      leftWall.castShadow = true;
      leftWall.receiveShadow = true;
      wallsGroup.add(leftWall);

      // Right wall (along Z, at X = 400)
      const rightWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 380 + wallThickness * 2);
      const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
      rightWall.position.set(400 + wallThickness / 2, wallHeight / 2, 0);
      rightWall.castShadow = true;
      rightWall.receiveShadow = true;
      wallsGroup.add(rightWall);

      // Glowing trim stripes on top of walls
      const hStripeGeo = new THREE.BoxGeometry(800, 1, 1);
      const topStripe = new THREE.Mesh(hStripeGeo, stripeMat);
      topStripe.position.set(0, wallHeight, -190);
      wallsGroup.add(topStripe);

      const bottomStripe = new THREE.Mesh(hStripeGeo, stripeMat);
      bottomStripe.position.set(0, wallHeight, 190);
      wallsGroup.add(bottomStripe);

      const vStripeGeo = new THREE.BoxGeometry(1, 1, 380);
      const leftStripe = new THREE.Mesh(vStripeGeo, stripeMat);
      leftStripe.position.set(-400, wallHeight, 0);
      wallsGroup.add(leftStripe);

      const rightStripe = new THREE.Mesh(vStripeGeo, stripeMat);
      rightStripe.position.set(400, wallHeight, 0);
      wallsGroup.add(rightStripe);

      scene.add(wallsGroup);

      // Robot 3D Group
      const robotGroup = new THREE.Group();
      const robotBodyGroup = new THREE.Group();
      
      // White base casing (50 x 14 x 44)
      const whiteBaseGeo = new RoundedBoxGeometry(50, 14, 44, 2, 2);
      const whiteBaseMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
      const whiteBase = new THREE.Mesh(whiteBaseGeo, whiteBaseMat);
      whiteBase.position.y = 7;
      whiteBase.castShadow = true;
      whiteBase.receiveShadow = true;
      robotBodyGroup.add(whiteBase);
      
      // Yellow top cover (50 x 8 x 44)
      const yellowCoverGeo = new RoundedBoxGeometry(50, 8, 44, 2, 2);
      const yellowCoverMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
      const yellowCover = new THREE.Mesh(yellowCoverGeo, yellowCoverMat);
      yellowCover.position.y = 14 + 4;
      yellowCover.castShadow = true;
      yellowCover.receiveShadow = true;
      robotBodyGroup.add(yellowCover);

      // Spike Hub screen (24 x 1.2 x 24)
      const ledCanvas = document.createElement('canvas');
      ledCanvas.width = 256;
      ledCanvas.height = 256;
      const ledTex = new THREE.CanvasTexture(ledCanvas);
      const screenGeo = new THREE.BoxGeometry(36, 1.2, 36);
      const screenMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.2,
        metalness: 0.9,
        emissiveMap: ledTex,
        emissive: 0xffffff,
        emissiveIntensity: 1.5
      });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(0, 14 + 8 + 0.1, 0);
      robotBodyGroup.add(screenMesh);

      // Front notch pointer
      const notchGeo = new THREE.ConeGeometry(3, 8, 4);
      const notchMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
      const notch = new THREE.Mesh(notchGeo, notchMat);
      notch.rotation.x = Math.PI / 2;
      notch.rotation.z = -Math.PI / 2;
      notch.position.set(25, 14, 0);
      robotBodyGroup.add(notch);

      robotGroup.add(robotBodyGroup);
      
      // Left Wheel
      const tireGeo = new THREE.CylinderGeometry(15, 15, 6, 32);
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x48c6de, roughness: 0.7, metalness: 0.1 });
      const rimGeo = new THREE.CylinderGeometry(12.5, 12.5, 6.2, 32);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.1 });
      const spokeGeo = new THREE.BoxGeometry(22, 1, 2);
      const spokeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });

      const leftWheel = new THREE.Group();
      leftWheel.rotation.x = Math.PI / 2;
      leftWheel.position.set(0, 15, -25);
      robotGroup.add(leftWheel);

      const leftTire = new THREE.Mesh(tireGeo, tireMat);
      leftTire.castShadow = true;
      leftWheel.add(leftTire);

      const leftRim = new THREE.Mesh(rimGeo, rimMat);
      leftWheel.add(leftRim);

      const leftWheelSpoke1 = new THREE.Mesh(spokeGeo, spokeMat);
      leftWheelSpoke1.position.set(0, -3.1, 0);
      leftWheel.add(leftWheelSpoke1);
      const leftWheelSpoke2 = leftWheelSpoke1.clone();
      leftWheelSpoke2.rotation.y = Math.PI / 2;
      leftWheel.add(leftWheelSpoke2);

      // Right Wheel
      const rightWheel = new THREE.Group();
      rightWheel.rotation.x = Math.PI / 2;
      rightWheel.position.set(0, 15, 25);
      robotGroup.add(rightWheel);

      const rightTire = new THREE.Mesh(tireGeo, tireMat);
      rightTire.castShadow = true;
      rightWheel.add(rightTire);

      const rightRim = new THREE.Mesh(rimGeo, rimMat);
      rightWheel.add(rightRim);

      const rightWheelSpoke1 = new THREE.Mesh(spokeGeo, spokeMat);
      rightWheelSpoke1.position.set(0, 3.1, 0);
      rightWheel.add(rightWheelSpoke1);
      const rightWheelSpoke2 = rightWheelSpoke1.clone();
      rightWheelSpoke2.rotation.y = Math.PI / 2;
      rightWheel.add(rightWheelSpoke2);

      // Castor Ball
      const castorGeo = new THREE.SphereGeometry(4, 16, 16);
      const castorMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3 });
      const castor = new THREE.Mesh(castorGeo, castorMat);
      castor.position.set(-20, 4, 0);
      castor.castShadow = true;
      robotGroup.add(castor);

      // Sensor attachments group
      const sensorGroup = new THREE.Group();
      robotGroup.add(sensorGroup);

      scene.add(robotGroup);

      // Trail line
      const trailMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 3 });
      const trailGeo = new THREE.BufferGeometry();
      const trailLine = new THREE.Line(trailGeo, trailMat);
      scene.add(trailLine);

      const obstacleMeshes = new Map();

      threeRef.current = {
        scene,
        camera,
        renderer,
        controls,
        robotGroup,
        leftWheel,
        rightWheel,
        ledScreenMesh: screenMesh,
        ledTexture: ledTex,
        ledCanvas,
        obstacleMeshes,
        trailLine,
        floorMesh: floor,
        floorTexture: floorTex,
        sensorGroup,
        lights: [ambientLight, dirLight, hemiLight],
        dragPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      };
    }

    const t = threeRef.current;
    t.floorTexture.needsUpdate = true;

    let lastTime = performance.now();

    const updateCanvasSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        const targetW = Math.floor(rect.width);
        const targetH = Math.floor(rect.height);
        
        const currentSize = new THREE.Vector2();
        t.renderer.getSize(currentSize);
        
        if (currentSize.x !== targetW || currentSize.y !== targetH) {
          t.renderer.setSize(targetW, targetH, true);
          t.camera.aspect = targetW / targetH;
          t.camera.updateProjectionMatrix();
        }
      }
    };

    const loop = () => {
      updateCanvasSize();

      const now = performance.now();
      let dt = (now - lastTime) / 1000;
      if (dt > 0.1) dt = 0.1;
      lastTime = now;

      // 2. Physics Updates (only if playing)
      if (isPlaying) {
        const rob = robotRef.current;

        const speedL = rob.leftSpeed;
        const speedR = rob.rightSpeed;
        
        const linearVel = (speedL + speedR) / 2;
        const trackWidth = (wheelDistance || 11.5) * (800 / 240);
        const angularVel = ((speedR - speedL) / trackWidth) * (180 / Math.PI);

        const headingRad = (rob.angle * Math.PI) / 180;

        const timeScale = dt * 60;
        const nextAngle = rob.angle + angularVel * timeScale;
        
        const avgAngle = rob.angle + (angularVel * timeScale) / 2;
        const avgHeadingRad = (avgAngle * Math.PI) / 180;
        
        const nextX = rob.x + linearVel * Math.cos(avgHeadingRad) * timeScale;
        const nextY = rob.y + linearVel * Math.sin(avgHeadingRad) * timeScale;

        const robotSize = 25;
        let collides = false;

        if (nextX < robotSize || nextX > W - robotSize || nextY < robotSize || nextY > H - robotSize) {
          collides = true;
        }

        if (mapType === 'maze') {
          const checkPoints = [
            { x: nextX, y: nextY },
            { x: nextX + robotSize * Math.cos(headingRad), y: nextY + robotSize * Math.sin(headingRad) },
            { x: nextX - robotSize * Math.cos(headingRad), y: nextY - robotSize * Math.sin(headingRad) },
            { x: nextX + robotSize * Math.cos(headingRad + Math.PI/2), y: nextY + robotSize * Math.sin(headingRad + Math.PI/2) },
            { x: nextX + robotSize * Math.cos(headingRad - Math.PI/2), y: nextY + robotSize * Math.sin(headingRad - Math.PI/2) },
          ];

          for (let cp of checkPoints) {
            try {
              const pixel = sensorContext.getImageData(Math.round(cp.x), Math.round(cp.y), 1, 1).data;
              if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0) {
                collides = true;
                break;
              }
            } catch (e) {}
          }
        }

        obstaclesRef.current.forEach(obs => {
          let distSq = 0;
          let cx = 0;
          let cy = 0;
          let rBox = 0;

          const isCircle = obs.shape === 'circle';
          if (isCircle) {
            rBox = obs.w / 2;
            cx = obs.x + rBox;
            cy = obs.y + rBox;
            distSq = (cx - nextX) * (cx - nextX) + (cy - nextY) * (cy - nextY);
          } else {
            cx = Math.max(obs.x, Math.min(nextX, obs.x + obs.w));
            cy = Math.max(obs.y, Math.min(nextY, obs.y + obs.h));
            distSq = (cx - nextX) * (cx - nextX) + (cy - nextY) * (cy - nextY);
          }

          const collisionThreshold = isCircle ? (robotSize + rBox) : robotSize;
          const hasCollided = isCircle ? (distSq < collisionThreshold * collisionThreshold) : (distSq < robotSize * robotSize);

          if (hasCollided) {
            if (obs.pushable) {
              const dist = Math.sqrt(distSq);
              let dx = 0;
              let dy = 0;
              
              if (dist > 0.1) {
                const overlap = collisionThreshold - dist;
                const pushDirX = (cx - nextX) / dist;
                const pushDirY = (cy - nextY) / dist;
                dx = pushDirX * overlap;
                dy = pushDirY * overlap;
              } else {
                const angleRad = (rob.angle * Math.PI) / 180;
                dx = Math.cos(angleRad) * 2;
                dy = Math.sin(angleRad) * 2;
              }

              const newBoxX = obs.x + dx;
              const newBoxY = obs.y + dy;

              let boxBlocked = false;
              if (newBoxX < 5 || newBoxX + obs.w > W - 5 || newBoxY < 5 || newBoxY + obs.h > H - 5) {
                boxBlocked = true;
              }

              if (!boxBlocked) {
                for (let other of obstaclesRef.current) {
                  if (other.id === obs.id) continue;
                  
                  const otherIsCircle = other.shape === 'circle';
                  const thisIsCircle = obs.shape === 'circle';
                  
                  if (thisIsCircle && otherIsCircle) {
                    const r1 = obs.w / 2;
                    const r2 = other.w / 2;
                    const cx1 = newBoxX + r1;
                    const cy1 = newBoxY + r1;
                    const cx2 = other.x + r2;
                    const cy2 = other.y + r2;
                    const dSq = (cx1 - cx2) * (cx1 - cx2) + (cy1 - cy2) * (cy1 - cy2);
                    if (dSq < (r1 + r2) * (r1 + r2)) {
                      boxBlocked = true;
                      break;
                    }
                  } else if (!thisIsCircle && !otherIsCircle) {
                    if (newBoxX < other.x + other.w &&
                        newBoxX + obs.w > other.x &&
                        newBoxY < other.y + other.h &&
                        newBoxY + obs.h > other.y) {
                      boxBlocked = true;
                      break;
                    }
                  } else {
                    const circle = thisIsCircle ? { r: obs.w / 2, x: newBoxX + obs.w/2, y: newBoxY + obs.w/2 } : { r: other.w / 2, x: other.x + other.w/2, y: other.y + other.w/2 };
                    const rect = thisIsCircle ? other : { x: newBoxX, y: newBoxY, w: obs.w, h: obs.h };
                    
                    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
                    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
                    const dSq = (closestX - circle.x) * (closestX - circle.x) + (closestY - circle.y) * (closestY - circle.y);
                    if (dSq < circle.r * circle.r) {
                      boxBlocked = true;
                      break;
                    }
                  }
                }
              }

              if (!boxBlocked) {
                obs.x = newBoxX;
                obs.y = newBoxY;
              } else {
                collides = true;
              }
            } else {
              collides = true;
            }
          }
        });

        if (!collides) {
          rob.x = nextX;
          rob.y = nextY;
          rob.angle = nextAngle;
          rob.collision = false;
        } else {
          rob.collision = true;
          rob.leftSpeed = 0;
          rob.rightSpeed = 0;
        }

        if (trailEnabled && linearVel !== 0) {
          const lastPoint = rob.trail[rob.trail.length - 1];
          if (!lastPoint || Math.hypot(lastPoint.x - rob.x, lastPoint.y - rob.y) > 3) {
            rob.trail.push({ x: rob.x, y: rob.y });
            if (rob.trail.length > 500) rob.trail.shift();
          }
        }
      }

      // 3. Sensor Calculations
      const rob = robotRef.current;
      const headingRad = (rob.angle * Math.PI) / 180;

      const displaySensors = (sensors || []).filter(s => s.port && s.type);

      const currentReadings = {};
      const currentReadingsListForState = [];

      displaySensors.forEach((sensor, idx) => {
        const { localX, localY } = getSensorLocalCoords(sensor, idx, displaySensors);

        const sensorX = rob.x + localX * Math.cos(headingRad) - localY * Math.sin(headingRad);
        const sensorY = rob.y + localX * Math.sin(headingRad) + localY * Math.cos(headingRad);

        if (sensor.type === 'color') {
          let sampleX = sensorX;
          let sampleY = sensorY;
          if (sensor.direction === 'forward') {
            sampleX += 25 * Math.cos(headingRad);
            sampleY += 25 * Math.sin(headingRad);
          }

          let r = 255, g = 255, b = 255;
          const roundedX = Math.round(sampleX);
          const roundedY = Math.round(sampleY);

          let obstacleHit = null;
          if (sensor.direction === 'forward') {
            obstaclesRef.current.forEach(obs => {
              if (obs.shape === 'circle') {
                const radius = obs.w / 2;
                const cx = obs.x + radius;
                const cy = obs.y + radius;
                const dx = sampleX - cx;
                const dy = sampleY - cy;
                if (dx * dx + dy * dy <= radius * radius) {
                  obstacleHit = obs;
                }
              } else {
                if (sampleX >= obs.x && sampleX <= obs.x + obs.w && sampleY >= obs.y && sampleY <= obs.y + obs.h) {
                  obstacleHit = obs;
                }
              }
            });
          }

          if (obstacleHit) {
            const hex = obstacleHit.pushable ? (obstacleHit.color || '#D97706') : '#4B5563';
            const cleanHex = hex.replace('#', '');
            if (cleanHex.length === 6 || cleanHex.length === 3) {
              r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2), 16);
              g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4), 16);
              b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6), 16);
            }
          } else if (sensor.direction !== 'forward' && roundedX >= 0 && roundedX < W && roundedY >= 0 && roundedY < H) {
            try {
              const p = sensorContext.getImageData(roundedX, roundedY, 1, 1).data;
              r = p[0];
              g = p[1];
              b = p[2];
            } catch (e) {}
          }

          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          const reflection = Math.round((brightness / 255) * 100);

          let colorID = -1;
          let colorName = 'Nessuno';
          let colorHex = '#CCCCCC';

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          const isGrayShade = Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25;

          if (max < 45 || (brightness < 65 && chroma < 25)) {
            colorID = 0;
            colorName = 'Nero';
            colorHex = '#000000';
          } else if (max > 185 && chroma < 25) {
            colorID = 10;
            colorName = 'Bianco';
            colorHex = '#FFFFFF';
          } else if (!isGrayShade && chroma >= 15) {
            let hue = 0;
            if (max === r) {
              hue = ((g - b) / chroma) % 6;
            } else if (max === g) {
              hue = (b - r) / chroma + 2;
            } else {
              hue = (r - g) / chroma + 4;
            }
            hue = Math.round(hue * 60);
            if (hue < 0) hue += 360;

            if (hue >= 340 || hue < 22) {
              colorID = 9;
              colorName = 'Rosso';
              colorHex = '#EF4444';
            } else if (hue >= 22 && hue < 75) {
              colorID = 7;
              colorName = 'Giallo';
              colorHex = '#EAB308';
            } else if (hue >= 75 && hue < 155) {
              colorID = 5;
              colorName = 'Verde';
              colorHex = '#22C55E';
            } else if (hue >= 155 && hue < 190) {
              colorID = 4;
              colorName = 'Ciano';
              colorHex = '#06B6D4';
            } else if (hue >= 190 && hue < 260) {
              colorID = 3;
              colorName = 'Blu';
              colorHex = '#3B82F6';
            } else if (hue >= 260 && hue < 340) {
              colorID = 1;
              colorName = 'Magenta';
              colorHex = '#EC4899';
            }
          }

          const val = {
            type: 'color',
            color: colorID,
            colorName,
            colorHex,
            reflection,
            distance: 200,
            force: 0,
            sensorX,
            sensorY,
          };
          currentReadings[sensor.port.toUpperCase()] = val;
          currentReadingsListForState.push({ port: sensor.port, ...val });

          if (idx === 0 || sensor.port.toUpperCase() === 'E') {
            rob.color = colorID;
            rob.reflection = reflection;
          }
        } else if (sensor.type === 'distance') {
          const PIXELS_PER_CM = 800 / 240;
          let detectedDistCm = 200;
          const maxDistancePx = 200 * PIXELS_PER_CM;
          for (let d = 2 * PIXELS_PER_CM; d < maxDistancePx; d += 2 * PIXELS_PER_CM) {
            const checkX = sensorX + d * Math.cos(headingRad);
            const checkY = sensorY + d * Math.sin(headingRad);

            if (checkX < 0 || checkX > W || checkY < 0 || checkY > H) {
              detectedDistCm = Math.round(d / PIXELS_PER_CM);
              break;
            }

            let hit = false;
            obstaclesRef.current.forEach(obs => {
              if (obs.shape === 'circle') {
                const r = obs.w / 2;
                const cx = obs.x + r;
                const cy = obs.y + r;
                const dx = checkX - cx;
                const dy = checkY - cy;
                if (dx * dx + dy * dy <= r * r) {
                  hit = true;
                }
              } else {
                if (checkX >= obs.x && checkX <= obs.x + obs.w && checkY >= obs.y && checkY <= obs.y + obs.h) {
                  hit = true;
                }
              }
            });

            if (mapType === 'maze' && !hit) {
              try {
                const pixel = sensorContext.getImageData(Math.round(checkX), Math.round(checkY), 1, 1).data;
                if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0) {
                  hit = true;
                }
              } catch (e) {}
            }

            if (hit) {
              detectedDistCm = Math.round(d / PIXELS_PER_CM);
              break;
            }
          }

          const finalDistance = Math.max(0, detectedDistCm - 4);

          const val = {
            type: 'distance',
            color: -1,
            colorName: 'Nessuno',
            colorHex: '#CCCCCC',
            reflection: 100,
            distance: finalDistance,
            force: 0,
            sensorX,
            sensorY,
          };
          currentReadings[sensor.port.toUpperCase()] = val;
          currentReadingsListForState.push({ port: sensor.port, ...val });

          if (idx === 0 || sensor.port.toUpperCase() === 'F') {
            rob.distance = finalDistance;
          }
        } else if (sensor.type === 'force') {
          let detectedDist = 200;
          for (let d = 2; d < 15; d += 2) {
            const checkX = sensorX + d * Math.cos(headingRad);
            const checkY = sensorY + d * Math.sin(headingRad);

            if (checkX < 0 || checkX > W || checkY < 0 || checkY > H) {
              detectedDist = d;
              break;
            }

            let hit = false;
            obstaclesRef.current.forEach(obs => {
              if (obs.shape === 'circle') {
                const r = obs.w / 2;
                const cx = obs.x + r;
                const cy = obs.y + r;
                const dx = checkX - cx;
                const dy = checkY - cy;
                if (dx * dx + dy * dy <= r * r) {
                  hit = true;
                }
              } else {
                if (checkX >= obs.x && checkX <= obs.x + obs.w && checkY >= obs.y && checkY <= obs.y + obs.h) {
                  hit = true;
                }
              }
            });

            if (mapType === 'maze' && !hit) {
              try {
                const pixel = sensorContext.getImageData(Math.round(checkX), Math.round(checkY), 1, 1).data;
                if (pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0) {
                  hit = true;
                }
              } catch (e) {}
            }

            if (hit) {
              detectedDist = d;
              break;
            }
          }

          const isPressed = rob.collision || (detectedDist < 6);
          const forceVal = isPressed ? 10 : 0;

          const val = {
            type: 'force',
            color: -1,
            colorName: 'Nessuno',
            colorHex: '#CCCCCC',
            reflection: 100,
            distance: 200,
            force: forceVal,
            sensorX,
            sensorY,
          };
          currentReadings[sensor.port.toUpperCase()] = val;
          currentReadingsListForState.push({ port: sensor.port, ...val });
        }
      });

      sensorReadingsRef.current = currentReadings;

      // 4. Update Three.js Meshes
      t.robotGroup.position.set(rob.x - 400, 0, rob.y - 190);
      t.robotGroup.rotation.y = -headingRad;

      const spinFactor = 0.05;
      t.leftWheel.rotation.y -= rob.leftSpeed * spinFactor;
      t.rightWheel.rotation.y -= rob.rightSpeed * spinFactor;

      updateLedScreenTexture(rob.matrixText || '', rob.matrixImage || '', rob.beepActive);

      if (rob.beepActive) {
        t.ledScreenMesh.material.emissive.setHex(0xffaa22);
      } else {
        t.ledScreenMesh.material.emissive.setHex(0xffffff);
      }

      update3DSensors(displaySensors, currentReadings);
      syncObstacles3D(obstacles, selectedObstacleId);

      // Render Trail
      if (trailEnabled && rob.trail.length > 1) {
        const points = rob.trail.map(p => new THREE.Vector3(p.x - 400, 0.5, p.y - 190));
        const tempGeo = new THREE.BufferGeometry().setFromPoints(points);
        t.trailLine.geometry.dispose();
        t.trailLine.geometry = tempGeo;
        t.trailLine.visible = true;
      } else {
        t.trailLine.visible = false;
      }

      // Legacy readings calculations
      let legacyColorName = 'Nessuno';
      let legacyColorHex = '#CCCCCC';
      let legacyReflection = 100;
      let legacyDistance = 200;

      const firstColorReading: any = Object.values(currentReadings).find((r: any) => r.type === 'color');
      if (firstColorReading) {
        legacyColorName = firstColorReading.colorName;
        legacyColorHex = firstColorReading.colorHex;
        legacyReflection = firstColorReading.reflection;
      }
      const firstDistanceReading: any = Object.values(currentReadings).find((r: any) => r.type === 'distance');
      if (firstDistanceReading) {
        legacyDistance = firstDistanceReading.distance;
      }

      const K_speed = (((Math.PI * (wheelDiameter || 5.6)) / 6480) * (800 / 240)) / 10;
      
      let displayAngle = rob.angle - rob.yawResetAngle;
      displayAngle = ((((displayAngle + 180) % 360) + 360) % 360) - 180;

      setSensorsDisplay({
        x: Math.round(rob.x),
        y: Math.round(rob.y),
        angle: Math.round(displayAngle),
        leftSpeed: Math.round(K_speed > 0 ? rob.leftSpeed / K_speed : 0),
        rightSpeed: Math.round(K_speed > 0 ? rob.rightSpeed / K_speed : 0),
        distance: Math.round(legacyDistance),
        colorName: legacyColorName,
        colorHex: legacyColorHex,
        reflection: Math.round(legacyReflection),
        collision: rob.collision,
        matrixText: rob.matrixText,
        matrixImage: rob.matrixImage,
      });
      setActiveSensorsReadings(currentReadingsListForState);

      t.controls.update();
      t.renderer.render(t.scene, t.camera);

      animId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, obstacles, mapType, trailEnabled, wheelDistance, customBgImage, sensors, selectedObstacleId, language]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    stopSimulationCode();
    setIsPlaying(false);
    resetRobot(true);
  };

  useEffect(() => {
    if (isVirtualActive) {
      handleReset();
    }
  }, [isVirtualActive]);

  const selectedObstacle = obstacles.find(o => o.id === selectedObstacleId);

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 bg-neutral-700 text-white overflow-hidden transition-all duration-300 ${
      isFullscreen 
        ? 'fixed inset-0 z-50 w-screen h-screen rounded-none bg-neutral-700' 
        : 'rounded-none'
    }`}>
      {/* Stage Header - Spans full width to keep buttons at the far right border */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-600 z-10 p-3 select-none shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
          </span>
          <span className="font-bold text-sm tracking-wide uppercase text-neutral-200">{language === 'en' ? 'Robot Simulator' : 'Simulatore Robot'}</span>
          <span className="bg-neutral-600 text-neutral-200 text-[10px] font-bold px-2 py-0.5 rounded border border-neutral-550 select-none">
            240 x 114 cm
          </span>
        </div>
        
        <div className="flex items-center gap-2.5">
          {/* Map Selector */}
          <div className="flex items-center gap-1.5 bg-neutral-600/80 border border-neutral-500 rounded-lg px-2 py-1 text-xs">
            <MapIcon className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-neutral-300 hidden sm:inline">{language === 'en' ? 'Map' : 'Mappa'}:</span>
            <select
              value={mapType}
              onChange={(e) => setMapType(e.target.value as MapType)}
              className="bg-transparent font-bold text-white outline-none cursor-pointer text-xs"
            >
              <option value="line" className="bg-neutral-700">{language === 'en' ? 'Line follower' : 'Tracciato Linea'}</option>
              <option value="colors" className="bg-neutral-700">{language === 'en' ? 'Color squares' : 'Scacchiere Colori'}</option>
              <option value="maze" className="bg-neutral-700">{language === 'en' ? 'Maze' : 'Labirinto Maze'}</option>
              <option value="empty" className="bg-neutral-700">{language === 'en' ? 'Free space' : 'Area Libera'}</option>
              <option value="custom" className="bg-neutral-700">{language === 'en' ? 'Custom map' : 'Mappa Personalizzata'}</option>
            </select>
          </div>

          {/* Custom Background Upload Button */}
          {mapType === 'custom' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-sm border border-blue-500"
              title={language === 'en' ? 'Load background image from PC' : 'Carica immagine di sfondo dal PC'}
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language === 'en' ? 'Load Texture' : 'Carica Sfondo'}</span>
            </button>
          )}

          {/* Trail toggler */}
          <button
            onClick={() => setTrailEnabled(!trailEnabled)}
            className={`p-1.5 rounded-lg border transition-colors ${trailEnabled ? 'bg-yellow-400/20 border-yellow-500 text-yellow-400' : 'bg-neutral-600 border-neutral-550 text-neutral-300 hover:text-white'}`}
            title="Disegna tracciato robot"
          >
            {trailEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Telemetry Panel toggler */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1.5 rounded-lg border transition-colors ${isSidebarOpen ? 'bg-neutral-600 border-neutral-550 text-neutral-200 hover:text-white' : 'bg-yellow-400/20 border-yellow-500 text-yellow-400'}`}
            title={isSidebarOpen ? "Nascondi pannello sensori (Ingrandisci area robot)" : "Mostra pannello sensori"}
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Fullscreen toggler */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded-lg border transition-colors ${isFullscreen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-neutral-600 border-neutral-500 text-neutral-300 hover:text-white'}`}
            title={isFullscreen ? "Esci da Schermo Intero (Esc)" : "Schermo Intero"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Simulation Stage (Left part of environment) */}
        <div className="flex-1 flex flex-col relative min-w-0 bg-neutral-700 p-3 pt-0 select-none">
          {/* Canvas Render viewport */}
        <div className="flex-1 bg-neutral-800 border-2 border-neutral-700 rounded-lg overflow-hidden relative flex items-center justify-center">

          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
          />
          {/* Hidden Canvas for reading pixel colors under the robot sensor */}
          <canvas ref={offscreenCanvasRef} className="hidden" />

          {/* Hidden File Input for uploading custom background */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />



        </div>

        {/* Controls dock */}
        <div className="flex items-center justify-center gap-3 pt-2 border-t border-neutral-800/80 mt-1.5 z-10 w-full">
          <button
            onClick={async () => {
              runSimulationCode();
            }}
            disabled={isRunningCode}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold border border-black text-xs shadow-sm transition-all active:scale-95 cursor-pointer ${
              isRunningCode
                ? 'bg-neutral-800 text-neutral-600 border-neutral-700 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white hover:scale-[1.02]'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {language === 'en' ? 'Execute code' : 'Esegui codice'}
          </button>
          
          <button
            onClick={() => {
              stopSimulationCode();
              setIsPlaying(false);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold border border-black text-xs shadow-sm transition-all active:scale-95 cursor-pointer hover:scale-[1.02]"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop
          </button>

          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold border border-black text-xs shadow-sm transition-all active:scale-95 cursor-pointer hover:scale-[1.02]"
          >
            <Home className="w-3.5 h-3.5" />
            {language === 'en' ? 'Home' : 'Torna a casa'}
          </button>
        </div>
      </div>

      {/* Sensor Dashboard & Console Output (Right panel) */}
      {isSidebarOpen && (
        <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-neutral-700 bg-neutral-700 flex flex-col h-full overflow-hidden select-none">
          {/* Telemetry panel */}
          <div className="p-3 pt-[5vh] space-y-2.5 overflow-y-auto text-xs flex-1">
            {/* Wheel speeds */}
            <div className="grid grid-cols-2 gap-2 bg-neutral-800/60 p-2 rounded-lg border border-neutral-600">
              <div>
                <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Sx motor' : 'Motore Sinistro'}</span>
                <span className="font-mono font-bold text-neutral-100">{sensorsDisplay.leftSpeed} rpm</span>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Dx motor' : 'Motore Destro'}</span>
                <span className="font-mono font-bold text-neutral-100">{sensorsDisplay.rightSpeed} rpm</span>
              </div>
            </div>

            {/* Active dynamically configured sensors */}
            {activeSensorsReadings.map((reading, i) => {
              if (reading.type === 'color') {
                return (
                  <div key={i} className="flex items-center justify-between bg-neutral-800/60 p-2 rounded-lg border border-neutral-600">
                    <div>
                      <span className="text-yellow-400 font-bold block text-[10px]">{language === 'en' ? 'Color sensor' : 'Sensore Colore'} [{language === 'en' ? 'Port' : 'Porta'} {reading.port.toUpperCase()}]</span>
                      <span className="font-bold flex items-center gap-1.5 text-neutral-100">
                        <span className="w-2.5 h-2.5 rounded-full border border-neutral-600 inline-block" style={{ backgroundColor: reading.colorHex }}></span>
                        {language === 'en' ? (
                          {
                            'Nero': 'Black',
                            'Bianco': 'White',
                            'Rosso': 'Red',
                            'Verde': 'Green',
                            'Blu': 'Blue',
                            'Giallo': 'Yellow',
                            'Ciano': 'Cyan',
                            'Magenta': 'Magenta',
                            'Nessuno': 'None'
                          }[reading.colorName as string] || reading.colorName
                        ) : reading.colorName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Reflexion' : 'Riflessione'}</span>
                      <span className="font-mono font-bold text-neutral-100">{reading.reflection}%</span>
                    </div>
                  </div>
                );
              } else if (reading.type === 'distance') {
                return (
                  <div key={i} className="flex items-center justify-between bg-neutral-800/60 p-2 rounded-lg border border-neutral-600">
                    <div>
                      <span className="text-blue-400 font-bold block text-[10px]">{language === 'en' ? 'Distance sensor' : 'Sensore Distanza'} [{language === 'en' ? 'Port' : 'Porta'} {reading.port.toUpperCase()}]</span>
                      <span className="font-mono font-bold text-neutral-100">{reading.distance} cm</span>
                    </div>
                    {sensorsDisplay.collision && (
                      <div className="text-right">
                        <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Impact' : 'Impatto'}</span>
                        <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-red-500/30 text-red-400 border border-red-500/40">
                          {language === 'en' ? 'COLLISION' : 'COLLISIONE'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              } else if (reading.type === 'force') {
                return (
                  <div key={i} className="flex items-center justify-between bg-neutral-800/60 p-2 rounded-lg border border-neutral-600">
                    <div>
                      <span className="text-red-400 font-bold block text-[10px]">{language === 'en' ? 'Force (touch) sensor' : 'Sensore Forza'} [{language === 'en' ? 'Port' : 'Porta'} {reading.port.toUpperCase()}]</span>
                      <span className="font-bold text-neutral-100">{reading.force > 0 ? (language === 'en' ? 'Pressed' : 'Premuto') : (language === 'en' ? 'Released' : 'Rilasciato')}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Force' : 'Forza'}</span>
                      <span className="font-mono font-bold text-neutral-100">{reading.force} N</span>
                    </div>
                  </div>
                );
              }
              return null;
            })}

            {activeSensorsReadings.length === 0 && (
              <div className="text-neutral-400 italic text-[11px] p-2 text-center bg-neutral-800/30 rounded-lg border border-neutral-600">
                {language === 'en' ? 'No sensor configured. Configure them in the "Setup Robot" tab!' : 'Nessun sensore configurato. Configurali nella scheda "Setup Robot"!'}
              </div>
            )}

            {/* Gyro Sensor values */}
            <div className="flex items-center justify-between bg-neutral-800/60 p-2 rounded-lg border border-neutral-600">
              <div>
                <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Angle Yaw/Gyro' : 'Angolo Yaw / Gyro'}</span>
                <span className="font-mono font-bold text-neutral-100">{sensorsDisplay.angle}°</span>
              </div>
              <div className="text-right">
                <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Position (X, Y)' : 'Posizione (X, Y)'}</span>
                <span className="font-mono text-neutral-300">{(sensorsDisplay.x * 0.3).toFixed(1)} cm, {(sensorsDisplay.y * 0.3).toFixed(1)} cm</span>
              </div>
            </div>

            {/* LED Display output */}
            <div className="flex items-center gap-2.5 bg-neutral-800/60 p-2 rounded-lg border border-neutral-600">
              <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center border border-neutral-600 px-0.5 overflow-hidden">
                {sensorsDisplay.matrixText ? (
                  <span className={`font-mono font-extrabold text-red-500 text-center truncate ${
                    sensorsDisplay.matrixText.length <= 1 ? 'text-base' :
                    sensorsDisplay.matrixText.length === 2 ? 'text-sm' :
                    sensorsDisplay.matrixText.length === 3 ? 'text-xs' : 'text-[10px]'
                  }`}>
                    {sensorsDisplay.matrixText.substring(0, 4).toUpperCase()}
                  </span>
                ) : sensorsDisplay.matrixImage ? (
                  <span className="w-3 h-3 rounded bg-red-500 animate-pulse inline-block" title={sensorsDisplay.matrixImage}></span>
                ) : null}
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">{language === 'en' ? 'Brick screen' : 'Schermo Brick LED'}</span>
                <span className="text-[11px] font-bold text-neutral-200">
                  {sensorsDisplay.matrixText ? (language === 'en' ? `Text: "${sensorsDisplay.matrixText}"` : `Scrittura: "${sensorsDisplay.matrixText}"`) : sensorsDisplay.matrixImage ? (language === 'en' ? `Icon: ${sensorsDisplay.matrixImage}` : `Icona: ${sensorsDisplay.matrixImage}`) : (language === 'en' ? 'No activity' : 'Nessuna attività')}
                </span>
              </div>
            </div>
          </div>          {/* Proprietà Oggetto Selezionato */}
          {selectedObstacle && (
            <div className="border-t border-neutral-300 bg-neutral-100 p-3.5 flex flex-col gap-2.5 shrink-0 select-none animate-in fade-in slide-in-from-bottom-2 duration-150 shadow-[0_-4px_15px_rgba(0,0,0,0.2)] relative z-10">
              <div className="font-bold border-b border-neutral-300 pb-1.5 flex justify-between items-center text-[10px] uppercase tracking-wider text-amber-700">
                <span>Caratteristiche {selectedObstacle.pushable ? 'Oggetto Spostabile' : 'Muro'}</span>
                <button onClick={() => setSelectedObstacleId(null)} className="text-neutral-500 hover:text-neutral-700 cursor-pointer p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Shape Selection */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-neutral-600 font-semibold">Forma:</span>
                <div className="flex gap-1 bg-neutral-200 p-0.5 rounded border border-neutral-300">
                  <button
                    onClick={() => updateSelectedObstacle({ shape: 'square' })}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${(!selectedObstacle.shape || selectedObstacle.shape === 'square') ? 'bg-amber-500 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-800'}`}
                  >
                    Quadrata
                  </button>
                  <button
                    onClick={() => updateSelectedObstacle({ shape: 'circle' })}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${(selectedObstacle.shape === 'circle') ? 'bg-amber-500 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-800'}`}
                  >
                    Tonda
                  </button>
                </div>
              </div>

              {/* Preset Colors & custom picker */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-neutral-600 font-semibold">Colore:</span>
                {selectedObstacle.pushable ? (
                  <div className="flex items-center gap-1">
                    {['#000000', '#D97706', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'].map(col => (
                      <button
                        key={col}
                        onClick={() => updateSelectedObstacle({ color: col })}
                        className="w-3.5 h-3.5 rounded-full border border-neutral-300 shadow-sm hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                        style={{ backgroundColor: col }}
                      />
                    ))}
                    <input
                      type="color"
                      value={selectedObstacle.color || '#D97706'}
                      onChange={(e) => updateSelectedObstacle({ color: e.target.value })}
                      className="w-4 h-4 rounded p-0 border-0 bg-transparent cursor-pointer ml-1"
                      title="Scegli colore personalizzato (vibrante)"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded-full border border-neutral-300 shadow-sm bg-[#4B5563]" />
                    <span className="text-[10px] text-neutral-600">Grigio (fisso per muri)</span>
                  </div>
                )}
              </div>

              {/* Dimensions Sliders */}
              <div className="space-y-1.5 border-t border-neutral-300 pt-2">
                <div className="flex justify-between text-[10px] text-neutral-600 font-medium">
                  <span>{selectedObstacle.shape === 'circle' ? 'Diametro:' : 'Lunghezza:'}</span>
                  <span className="font-mono text-amber-700 font-bold">{selectedObstacle.w} px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  value={selectedObstacle.w}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (selectedObstacle.shape === 'circle') {
                      updateSelectedObstacle({ w: val, h: val });
                    } else {
                      updateSelectedObstacle({ w: val });
                    }
                  }}
                  className="w-full accent-amber-600 h-1 bg-neutral-300 rounded-lg appearance-none cursor-pointer"
                />
                {selectedObstacle.shape !== 'circle' && (
                  <>
                    <div className="flex justify-between text-[10px] text-neutral-600 font-medium pt-1">
                      <span>Larghezza:</span>
                      <span className="font-mono text-amber-700 font-bold">{selectedObstacle.h} px</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="120"
                      value={selectedObstacle.h}
                      onChange={(e) => updateSelectedObstacle({ h: parseInt(e.target.value) })}
                      className="w-full accent-amber-600 h-1 bg-neutral-300 rounded-lg appearance-none cursor-pointer"
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Sezione Gestione Oggetti Campo */}
          <div className="border-t border-neutral-600 bg-neutral-800/40 p-3 flex flex-col gap-2.5 shrink-0 select-none">
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-neutral-350 uppercase">
              <Layers className="w-3.5 h-3.5 text-yellow-500" />
              <span>{language === 'en' ? 'Objects on field' : 'Oggetti & Campo'}</span>
            </div>
            
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => addSolidObstacle('square')}
                  className="py-1.5 px-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex flex-row items-center justify-center gap-1.5 cursor-pointer border border-neutral-550 font-semibold text-[10px]"
                  title="Aggiungi un mattone solido rettangolare (non spingibile)"
                >
                  <div className="w-3.5 h-2 bg-neutral-500 rounded border border-neutral-400 shrink-0"></div>
                  <span>+ {language === 'en' ? 'Square wall' : 'Muro Quad'}</span>
                </button>
                <button
                  onClick={() => addSolidObstacle('circle')}
                  className="py-1.5 px-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex flex-row items-center justify-center gap-1.5 cursor-pointer border border-neutral-550 font-semibold text-[10px]"
                  title="Aggiungi un mattone solido cilindrico (non spingibile)"
                >
                  <div className="w-3 h-3 bg-neutral-500 rounded-full border border-neutral-400 shrink-0"></div>
                  <span>+ {language === 'en' ? 'Round wall' : 'Muro Tondo'}</span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => addPushableObstacle('square')}
                  className="py-1.5 px-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex flex-row items-center justify-center gap-1.5 cursor-pointer border border-neutral-550 font-semibold text-[10px]"
                  title="Aggiungi un oggetto spostabile quadrato che il robot può spingere"
                >
                  <div className="w-3 h-3 bg-amber-600 rounded border border-amber-500 shrink-0"></div>
                  <span>+ {language === 'en' ? 'Square moveable' : 'Spost. Quad'}</span>
                </button>
                <button
                  onClick={() => addPushableObstacle('circle')}
                  className="py-1.5 px-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex flex-row items-center justify-center gap-1.5 cursor-pointer border border-neutral-550 font-semibold text-[10px]"
                  title="Aggiungi un oggetto spostabile cilindrico che il robot può spingere"
                >
                  <div className="w-3 h-3 bg-amber-600 rounded-full border border-amber-500 shrink-0"></div>
                  <span>+ {language === 'en' ? 'Round moveable' : 'Spost. Tondo'}</span>
                </button>
              </div>

              {/* Pulsanti Esporta ed Importa Campo direttamente sotto */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={exportLayoutToFile}
                  className="py-1.5 px-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex flex-row items-center justify-center gap-1.5 cursor-pointer border border-neutral-550 font-semibold text-[10px]"
                  title="Esporta il campo come file JSON per condividerlo o conservarlo"
                >
                  <Download className="w-3 h-3 text-yellow-400 shrink-0" />
                  <span>{language === 'en' ? 'Save' : 'Esporta'}</span>
                </button>
                
                <button
                  onClick={() => fileImportInputRef.current?.click()}
                  className="py-1.5 px-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors flex flex-row items-center justify-center gap-1.5 cursor-pointer border border-neutral-550 font-semibold text-[10px]"
                  title="Importa una configurazione campo da un file JSON precedentemente salvato"
                >
                  <Upload className="w-3 h-3 text-purple-400 shrink-0" />
                  <span>{language === 'en' ? 'Open' : 'Importa'}</span>
                </button>
              </div>

              <div className="flex gap-2">
                {selectedObstacleId !== null && (
                  <button
                    onClick={deleteSelectedObstacle}
                    className="flex-1 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-red-200 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border border-red-900 font-bold text-[11px]"
                    title="Elimina l'oggetto selezionato"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Elimina</span>
                  </button>
                )}

                {obstacles.length > 0 && (
                  <button
                    onClick={clearAllObstacles}
                    className="flex-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-350 hover:text-neutral-200 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border border-neutral-600 font-medium text-[11px]"
                    title="Rimuovi tutti gli oggetti dal campo"
                  >
                    Svuota campo
                  </button>
                )}
              </div>
            </div>

            {/* Hidden file input for importing layout */}
            <input
              type="file"
              ref={fileImportInputRef}
              onChange={handleFileImport}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
