import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Usb, Bluetooth, Terminal, ExternalLink, AlertCircle, Square, Blocks, Code, Settings, X, Upload, Save, FolderOpen, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism.css';
import BlocklyEditor, { BlocklyEditorRef } from './components/BlocklyEditor';
import VirtualEnvironment from './components/VirtualEnvironment';
import {
  computeCrc,
  packMessage,
  unpackMessage,
  buildClearSlotRequest,
  buildStartFileUploadRequest,
  buildTransferChunkRequest,
  buildProgramFlowRequest,
  buildInfoRequest
} from './lib/spike3Protocol';
// @ts-ignore
import logoStaarr from './LogoStaarr.png';

interface MotorConfig {
  id: number;
  port: string;
  isTraction: boolean;
  isInverted: boolean;
}

interface SensorConfig {
  id: number;
  port: string;
  type: string;
  direction?: 'forward' | 'down';
}

const highlightWithBlockly = (code: string) => {
  const html = Prism.highlight(code, Prism.languages.python, 'python');
  
  const startToken = '<span class="token comment"># === START_BLOCKLY_CODE ===</span>';
  const endToken = '<span class="token comment"># === END_BLOCKLY_CODE ===</span>';
  
  let startIndex = html.indexOf(startToken);
  let startLen = startToken.length;
  
  if (startIndex === -1) {
      startIndex = html.indexOf('# === START_BLOCKLY_CODE ===');
      startLen = '# === START_BLOCKLY_CODE ==='.length;
  }
  
  let endIndex = html.indexOf(endToken);
  if (endIndex === -1) {
      endIndex = html.indexOf('# === END_BLOCKLY_CODE ===');
  }
  
  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    const before = html.substring(0, startIndex + startLen);
    const middle = html.substring(startIndex + startLen, endIndex);
    const after = html.substring(endIndex);
    return before + '<span style="background-color: rgba(253, 224, 71, 0.3); display: block; margin: 0 -16px; padding: 0 16px;">' + middle + '</span>' + after;
  }
  
  return html;
};

const updatePythonCodePorts = (
  code: string,
  leftMotor: { port: string; isInverted: boolean },
  rightMotor: { port: string; isInverted: boolean },
  motorPortMap: Record<string, string>,
  sensorPortMap: Record<string, string>
): string => {
  if (!code) return code;
  let updated = code;

  // 1. Mappa le altre porte nei comandi del codice utente (motor.run, sensor, etc.)
  const allMap = { ...sensorPortMap, ...motorPortMap };
  if (Object.keys(allMap).length > 0) {
    updated = updated.replace(/\bport\.([A-F])\b/g, (match, p) => {
      if (allMap[p]) {
        return `port.${allMap[p]}`;
      }
      return match;
    });
  }

  // 2. Aggiorna costanti trazione (garantisce sempre i valori effettivi scelti)
  if (leftMotor.port) {
    updated = updated.replace(/_LEFT_PORT\s*=\s*port\.[A-F]/g, `_LEFT_PORT = port.${leftMotor.port}`);
  }
  if (rightMotor.port) {
    updated = updated.replace(/_RIGHT_PORT\s*=\s*port\.[A-F]/g, `_RIGHT_PORT = port.${rightMotor.port}`);
  }
  updated = updated.replace(/_LEFT_INVERTED\s*=\s*(True|False)/g, `_LEFT_INVERTED = ${leftMotor.isInverted ? 'True' : 'False'}`);
  updated = updated.replace(/_RIGHT_INVERTED\s*=\s*(True|False)/g, `_RIGHT_INVERTED = ${rightMotor.isInverted ? 'True' : 'False'}`);

  // 3. Aggiorna accoppiamento motori
  if (leftMotor.port && rightMotor.port) {
    updated = updated.replace(
      /motor_pair\.pair\(\s*motor_pair\.PAIR_1\s*,\s*port\.[A-F]\s*,\s*port\.[A-F]\s*\)/g,
      `motor_pair.pair(motor_pair.PAIR_1, port.${leftMotor.port}, port.${rightMotor.port})`
    );
    updated = updated.replace(
      /Impossibile accoppiare i motori sulle porte [A-F] e [A-F]/g,
      `Impossibile accoppiare i motori sulle porte ${leftMotor.port} e ${rightMotor.port}`
    );
  }

  return updated;
};

class BluetoothSerialPort {
  device: any;
  server: any;
  rxChar: any;
  txChar: any;
  readable: any;
  writable: any;
  _readableStreamController: any;
  protocol: string;
  onDisconnect: (() => void) | null = null;
  _pendingResolvers: Map<number, (msg: Uint8Array) => void> = new Map();
  _buffer: number[] = [];

  constructor(device: any) {
    this.device = device;
    this.readable = new ReadableStream({
      start: (controller) => {
        this._readableStreamController = controller;
      }
    });
    this.writable = new WritableStream({
      write: async (chunk) => {
        if (this.rxChar) {
          if (this.protocol === 'spike3') {
            // For spike3, we write using custom packets, not raw text writes
            return;
          }
          const CHUNK_SIZE = 20;
          for (let i = 0; i < chunk.length; i += CHUNK_SIZE) {
            const slice = chunk.slice(i, i + CHUNK_SIZE);
            try {
              if (this.rxChar.properties.writeWithoutResponse) {
                await this.rxChar.writeValueWithoutResponse(slice);
              } else {
                await this.rxChar.writeValue(slice);
              }
            } catch (e) {
              try {
                await this.rxChar.writeValue(slice);
              } catch (e2) {
                console.error("Errore di scrittura Bluetooth:", e2);
              }
            }
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
      }
    });
  }

  async sendSpike3Request(
    payload: Uint8Array, 
    expectedResponseId: number | null, 
    timeoutMs: number = 8000, 
    optional: boolean = false
  ): Promise<Uint8Array | null> {
    const frame = packMessage(payload);
    
    let responsePromise: Promise<Uint8Array | null> = Promise.resolve(null);
    if (expectedResponseId !== null) {
      responsePromise = new Promise<Uint8Array | null>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          if (this._pendingResolvers.has(expectedResponseId)) {
            this._pendingResolvers.delete(expectedResponseId);
            if (optional) {
              resolve(null);
            } else {
              reject(new Error(`Timeout in attesa della risposta 0x${expectedResponseId.toString(16)}`));
            }
          }
        }, timeoutMs);

        this._pendingResolvers.set(expectedResponseId, (msg) => {
          clearTimeout(timeoutHandle);
          resolve(msg);
        });
      });
    }

    const packetSize = 128;
    for (let i = 0; i < frame.length; i += packetSize) {
      const packet = frame.slice(i, i + packetSize);
      if (this.rxChar.properties.write) {
        await this.rxChar.writeValue(packet);
      } else if (this.rxChar.properties.writeWithoutResponse) {
        await this.rxChar.writeValueWithoutResponse(packet);
      } else {
        await this.rxChar.writeValue(packet);
      }
      await new Promise(resolve => setTimeout(resolve, 8)); // Safe pacing delay
    }

    return responsePromise;
  }

  async clearSpike3Slot(slot: number): Promise<boolean> {
    try {
      const req = buildClearSlotRequest(slot);
      const res = await this.sendSpike3Request(req, 0x47, 1000, true);
      return res ? res[1] === 0 : true;
    } catch (e) {
      console.warn("clearSpike3Slot fallito o non riconosciuto:", e);
      return true;
    }
  }

  async uploadSpike3Program(program: string, slot: number, filename: string = "program.py", onProgress?: (p: number) => void): Promise<boolean> {
    try {
      let programData = new TextEncoder().encode(program);
      const remainder = programData.length % 4;
      if (remainder !== 0) {
        const padded = new Uint8Array(programData.length + (4 - remainder));
        padded.set(programData);
        // Pad with newlines so it's a valid Python file
        for (let i = programData.length; i < padded.length; i++) {
          padded[i] = 0x0A; 
        }
        programData = padded;
      }
      
      const programCrc = computeCrc(programData, 0);

      // 1. Start upload
      const startReq = buildStartFileUploadRequest(filename, slot, programCrc);
      const startRes = await this.sendSpike3Request(startReq, 0x0d, 8000, false);
      if (startRes && startRes[1] !== 0) {
        throw new Error(`Start file upload non riconosciuto da SPIKE 3 Hub (codice errore: ${startRes[1]})`);
      }

      if (onProgress) onProgress(0);

      // 2. Transfer in chunks
      let runningCrc = 0;
      const chunkSize = 256;
      for (let i = 0; i < programData.length; i += chunkSize) {
        const chunk = programData.slice(i, i + chunkSize);
        runningCrc = computeCrc(chunk, runningCrc);
        
        const chunkReq = buildTransferChunkRequest(runningCrc, chunk);
        try {
          await this.sendSpike3Request(chunkReq, null);
          // Wait briefly between chunks
          await new Promise(r => setTimeout(r, 10));
        } catch (e: any) {
          throw e;
        }

        if (onProgress) {
          onProgress(Math.min(100, Math.round(((i + chunk.length) / programData.length) * 100)));
        }
      }

      return true;
    } catch (e: any) {
      console.error("Errore nel caricamento del programma SPIKE 3:", e);
      throw e;
    }
  }

  async startSpike3Program(slot: number): Promise<boolean> {
    try {
      const req = buildProgramFlowRequest(false, slot);
      // Molti firmware SPIKE 3 eseguono il codice direttamente senza inviare ack 0x1f.
      // Se arriva una risposta esplicita, controlliamo il codice di ritorno, altrimenti assumiamo successo.
      const res = await this.sendSpike3Request(req, 0x1f, 800, true);
      if (res && res.length > 1) {
        return res[1] === 0;
      }
      return true;
    } catch (e) {
      console.error("Impossibile avviare il programma SPIKE 3:", e);
      return false;
    }
  }

  async stopSpike3Program(slot: number): Promise<boolean> {
    try {
      const req = buildProgramFlowRequest(true, slot);
      const res = await this.sendSpike3Request(req, 0x1f, 800, true);
      if (res && res.length > 1) {
        return res[1] === 0;
      }
      return true;
    } catch (e) {
      console.error("Impossibile interrompere il programma SPIKE 3:", e);
      return false;
    }
  }

  async open() {
    let retries = 3;
    while (retries > 0) {
      try {
        this.server = await this.device.gatt.connect();
        break;
      } catch (e: any) {
        retries--;
        console.warn(`GATT connect failed. Retries left: ${retries}`, e);
        if (retries === 0) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    // Attendi mezzo secondo per dare tempo al dispositivo di completare la negoziazione GATT
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const tryService = async (serviceId: string, rxId: string, txId: string) => {
      try {
        const service = await this.server.getPrimaryService(serviceId);
        this.rxChar = await service.getCharacteristic(rxId);
        this.txChar = await service.getCharacteristic(txId);
        return true;
      } catch (e: any) {
        console.log(`Impossibile connettersi al servizio ${serviceId}:`, e.message);
        return false;
      }
    };

    let success = false;
    this.protocol = '';

    let foundServices = "";
    try {
      const services = await this.server.getPrimaryServices();
      foundServices = services.map((s: any) => s.uuid).join(', ');
      console.log("Servizi disponibili:", foundServices);
    } catch (e) {
      console.log("Impossibile elencare i servizi", e);
    }

    if (await tryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e', '6e400002-b5a3-f393-e0a9-e50e24dcca9e', '6e400003-b5a3-f393-e0a9-e50e24dcca9e')) {
      success = true;
      this.protocol = 'nus';
    } else if (await tryService('c5f50001-8280-46da-89f4-6d8051e4aeef', 'c5f50002-8280-46da-89f4-6d8051e4aeef', 'c5f50003-8280-46da-89f4-6d8051e4aeef')) {
      success = true;
      this.protocol = 'pybricks';
    } else if (await tryService('00001623-1212-efde-1623-785feabcd123', '00001624-1212-efde-1623-785feabcd123', '00001624-1212-efde-1623-785feabcd123')) {
      success = true;
      this.protocol = 'lwp3';
    } else if (await tryService('0000fd02-0000-1000-8000-00805f9b34fb', '0000fd02-0001-1000-8000-00805f9b34fb', '0000fd02-0002-1000-8000-00805f9b34fb')) {
      success = true;
      this.protocol = 'spike3';
    }

    if (!success) {
      throw new Error(`Servizio non trovato. Hai selezionato il dispositivo giusto? Servizi trovati sul dispositivo: ${foundServices || "Nessuno o inaccessibili"}. Assicurati di selezionare il LEGO Hub e non le cuffie o altri dispositivi Bluetooth.`);
    }
    
    try {
      await this.txChar.startNotifications();
    } catch(e: any) {
      throw new Error(`Errore in startNotifications: ${e.message}`);
    }
    
    this.txChar.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      const array = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      
      if (this.protocol === 'spike3') {
        for (let i = 0; i < array.length; i++) {
          this._buffer.push(array[i]);
          if (array[i] === 0x02) { // DELIMITER
            const frame = new Uint8Array(this._buffer);
            this._buffer = [];
            try {
              const unpacked = unpackMessage(frame);
              if (unpacked.length > 0) {
                const messageId = unpacked[0];
                if (messageId === 0x21) { // ConsoleNotification
                  const textBytes = unpacked.slice(1).filter((b) => b !== 0);
                  if (this._readableStreamController) {
                    this._readableStreamController.enqueue(textBytes);
                  }
                } else if (this._pendingResolvers.has(messageId)) {
                  const resolver = this._pendingResolvers.get(messageId);
                  this._pendingResolvers.delete(messageId);
                  if (resolver) resolver(unpacked);
                }

              }
            } catch (err) {
              console.error("Errore decodifica frame SPIKE 3:", err);
            }
          }
        }
      } else {
        if (this._readableStreamController) {
          this._readableStreamController.enqueue(array);
        }
      }
    });
    
    this.device.addEventListener('gattserverdisconnected', () => {
      if (this._readableStreamController) {
        try {
          this._readableStreamController.close();
        } catch(e) {}
      }
      if (this.onDisconnect) {
        this.onDisconnect();
      }
    });
  }

  async close() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    if (this._readableStreamController) {
      try {
        this._readableStreamController.close();
      } catch (e) {}
    }
  }
}

class WrappedSerialPort {
  serialPort: any;
  readable: any;
  writable: any;
  _readableStreamController: any;
  protocol: string = 'repl'; // Default to repl
  _pendingResolvers: Map<number, (msg: Uint8Array) => void> = new Map();
  _buffer: number[] = [];
  _reader: any = null;
  _keepReading: boolean = false;
  _readLoopPromise: Promise<void> | null = null;

  constructor(serialPort: any) {
    this.serialPort = serialPort;
    
    // Custom readable stream so we can intercept and parse frames
    this.readable = new ReadableStream({
      start: (controller) => {
        this._readableStreamController = controller;
      },
      cancel: () => {
        this._keepReading = false;
      }
    });

    // Custom writable stream that proxies writes to the underlying serialPort.writable
    this.writable = new WritableStream({
      write: async (chunk) => {
        if (this.serialPort && this.serialPort.writable) {
          const writer = this.serialPort.writable.getWriter();
          try {
            await writer.write(chunk);
          } finally {
            writer.releaseLock();
          }
        }
      }
    });
  }

  async sendSpike3Request(
    payload: Uint8Array, 
    expectedResponseId: number | null, 
    timeoutMs: number = 4000, 
    optional: boolean = false
  ): Promise<Uint8Array | null> {
    const frame = packMessage(payload);
    
    let responsePromise: Promise<Uint8Array | null> = Promise.resolve(null);
    if (expectedResponseId !== null) {
      responsePromise = new Promise<Uint8Array | null>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          if (this._pendingResolvers.has(expectedResponseId)) {
            this._pendingResolvers.delete(expectedResponseId);
            if (optional) {
              resolve(null);
            } else {
              reject(new Error(`Timeout in attesa della risposta 0x${expectedResponseId.toString(16)}`));
            }
          }
        }, timeoutMs);

        this._pendingResolvers.set(expectedResponseId, (msg) => {
          clearTimeout(timeoutHandle);
          resolve(msg);
        });
      });
    }

    if (this.serialPort && this.serialPort.writable) {
      const writer = this.serialPort.writable.getWriter();
      try {
        const packetSize = 128;
        for (let i = 0; i < frame.length; i += packetSize) {
          const packet = frame.slice(i, i + packetSize);
          await writer.write(packet);
          await new Promise(resolve => setTimeout(resolve, 8)); // Safe pacing delay
        }
      } finally {
        writer.releaseLock();
      }
    }

    return responsePromise;
  }

  async clearSpike3Slot(slot: number): Promise<boolean> {
    try {
      const req = buildClearSlotRequest(slot);
      const res = await this.sendSpike3Request(req, 0x47, 1000, true);
      return res ? res[1] === 0 : true;
    } catch (e) {
      console.warn("clearSpike3Slot fallito:", e);
      return true;
    }
  }

  async uploadSpike3Program(program: string, slot: number, filename: string = "program.py", onProgress?: (p: number) => void): Promise<boolean> {
    try {
      let programData = new TextEncoder().encode(program);
      const remainder = programData.length % 4;
      if (remainder !== 0) {
        const padded = new Uint8Array(programData.length + (4 - remainder));
        padded.set(programData);
        // Pad with newlines so it's a valid Python file
        for (let i = programData.length; i < padded.length; i++) {
          padded[i] = 0x0a; 
        }
        programData = padded;
      }
      
      const programCrc = computeCrc(programData, 0);

      // 1. Start upload
      const startReq = buildStartFileUploadRequest(filename, slot, programCrc);
      const startRes = await this.sendSpike3Request(startReq, 0x0d, 4000, false);
      if (startRes && startRes[1] !== 0) {
        throw new Error(`Start file upload non riconosciuto da SPIKE 3 Hub (codice errore: ${startRes[1]})`);
      }

      if (onProgress) onProgress(0);

      // 2. Transfer in chunks
      let runningCrc = 0;
      const chunkSize = 256;
      for (let i = 0; i < programData.length; i += chunkSize) {
        const chunk = programData.slice(i, i + chunkSize);
        runningCrc = computeCrc(chunk, runningCrc);
        
        const chunkReq = buildTransferChunkRequest(runningCrc, chunk);
        try {
          await this.sendSpike3Request(chunkReq, null);
          // Wait briefly between chunks
          await new Promise(r => setTimeout(r, 10));
        } catch (e: any) {
          throw e;
        }

        if (onProgress) {
          onProgress(Math.min(100, Math.round(((i + chunk.length) / programData.length) * 100)));
        }
      }

      return true;
    } catch (e: any) {
      console.error("Errore nel caricamento del programma SPIKE 3:", e);
      throw e;
    }
  }

  async startSpike3Program(slot: number): Promise<boolean> {
    try {
      const req = buildProgramFlowRequest(false, slot);
      // Molti firmware SPIKE 3 eseguono il codice direttamente senza inviare ack 0x1f.
      // Se arriva una risposta esplicita, controlliamo il codice di ritorno, altrimenti assumiamo successo.
      const res = await this.sendSpike3Request(req, 0x1f, 800, true);
      if (res && res.length > 1) {
        return res[1] === 0;
      }
      return true;
    } catch (e) {
      console.error("Impossibile avviare il programma SPIKE 3:", e);
      return false;
    }
  }

  async stopSpike3Program(slot: number): Promise<boolean> {
    try {
      const req = buildProgramFlowRequest(true, slot);
      const res = await this.sendSpike3Request(req, 0x1f, 800, true);
      if (res && res.length > 1) {
        return res[1] === 0;
      }
      return true;
    } catch (e) {
      console.error("Impossibile interrompere il programma SPIKE 3:", e);
      return false;
    }
  }

  startInternalReadLoop() {
    this._keepReading = true;
    this._readLoopPromise = (async () => {
      while (this.serialPort && this.serialPort.readable && this._keepReading) {
        try {
          const reader = this.serialPort.readable.getReader();
          this._reader = reader;
          try {
            while (this._keepReading) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              if (value) {
                this._handleIncomingBytes(value);
              }
            }
          } catch (error) {
            console.error("Errore lettura interna seriale:", error);
            break;
          } finally {
            this._reader = null;
            try {
              reader.releaseLock();
            } catch (e) {}
          }
        } catch (err) {
          console.error("Errore reader interno seriale:", err);
          break;
        }
      }
    })();
  }

  _handleIncomingBytes(array: Uint8Array) {
    if (this.protocol === 'spike3') {
      for (let i = 0; i < array.length; i++) {
        this._buffer.push(array[i]);
        if (array[i] === 0x02) { // DELIMITER
          const frame = new Uint8Array(this._buffer);
          this._buffer = [];
          try {
            const unpacked = unpackMessage(frame);
            if (unpacked.length > 0) {
              const messageId = unpacked[0];
              if (messageId === 0x21) { // ConsoleNotification
                const textBytes = unpacked.slice(1).filter((b) => b !== 0);
                if (this._readableStreamController) {
                  this._readableStreamController.enqueue(textBytes);
                }
              } else if (this._pendingResolvers.has(messageId)) {
                const resolver = this._pendingResolvers.get(messageId);
                this._pendingResolvers.delete(messageId);
                if (resolver) resolver(unpacked);
              }
            }
          } catch (err) {
            console.error("Errore decodifica frame SPIKE 3 seriale:", err);
          }
        }
      }
    } else {
      // In REPL mode, just pass-through raw bytes to log reader
      if (this._readableStreamController) {
        this._readableStreamController.enqueue(array);
      }
    }
  }

  async detectProtocol(): Promise<string> {
    try {
      // Temporarily set protocol to spike3 to parse incoming handshake response
      this.protocol = 'spike3';
      const req = buildInfoRequest();
      
      const res = await Promise.race([
        this.sendSpike3Request(req, 0x01),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 800))
      ]);

      if (res && res[0] === 0x01) {
        console.log("SPIKE 3 protocol detected on serial connection!");
        this.protocol = 'spike3';
        return 'spike3';
      } else {
        console.log("SPIKE 3 protocol handshake timed out or failed. Falling back to REPL mode.");
        this.protocol = 'repl';
        return 'repl';
      }
    } catch (e) {
      console.log("Error during SPIKE 3 serial detection:", e);
      this.protocol = 'repl';
      return 'repl';
    }
  }

  async close() {
    this._keepReading = false;
    if (this._reader) {
      try {
        await this._reader.cancel();
      } catch (e) {}
    }
    if (this._readLoopPromise) {
      try {
        await this._readLoopPromise;
      } catch (e) {}
    }
    if (this.serialPort && this.serialPort.close) {
      try {
        await this.serialPort.close();
      } catch (e) {}
    }
    if (this._readableStreamController) {
      try {
        this._readableStreamController.close();
      } catch (e) {}
    }
  }
}

export default function App() {
  const [port, setPort] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [customCode, setCustomCode] = useState<string>('');
  const [blocklyCode, setBlocklyCode] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'blocks' | 'python'>('blocks');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSerialSupported, setIsSerialSupported] = useState(true);
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const [isInIframe, setIsInIframe] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const TOTAL_SLOTS = 6;
  const [isVirtualActive, setIsVirtualActive] = useState(false);
  const [language, setLanguage] = useState<'it' | 'en'>('it');

  const [batteryState, setBatteryState] = useState<{
    voltage: number | null;
    current: number | null;
    temperature: number | null;
    percentage: number | null;
    lastUpdated: Date | null;
  }>({
    voltage: null,
    current: null,
    temperature: null,
    percentage: null,
    lastUpdated: null,
  });
  
  const [motors, setMotors] = useState<MotorConfig[]>(() => {
    const saved = localStorage.getItem('spike_motors');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Errore nel parsing dei motori salvati:", e);
      }
    }
    return [
      { id: 1, port: 'C', isTraction: true, isInverted: true },
      { id: 2, port: 'D', isTraction: true, isInverted: false },
      { id: 3, port: 'E', isTraction: false, isInverted: false },
      { id: 4, port: '', isTraction: false, isInverted: false },
    ];
  });

  const [sensors, setSensors] = useState<SensorConfig[]>(() => {
    const saved = localStorage.getItem('spike_sensors');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Errore nel parsing dei sensori salvati:", e);
      }
    }
    return [
      { id: 1, port: 'A', type: 'force', direction: 'down' },
      { id: 2, port: 'B', type: 'color', direction: 'forward' },
      { id: 3, port: 'F', type: 'distance', direction: 'down' },
      { id: 4, port: '', type: '', direction: 'down' },
    ];
  });

  const [wheelDiameter, setWheelDiameter] = useState<number>(() => {
    const saved = localStorage.getItem('spike_wheel_diameter');
    return saved ? parseFloat(saved) : 5.6;
  });

  const [wheelDistance, setWheelDistance] = useState<number>(() => {
    const saved = localStorage.getItem('spike_wheel_distance');
    return saved ? parseFloat(saved) : 11.5;
  });

  const [maxMotorSpeed, setMaxMotorSpeed] = useState<number>(() => {
    const saved = localStorage.getItem('spike_max_motor_speed');
    return saved ? parseInt(saved) : 100;
  });

  const [draftMotors, setDraftMotors] = useState<MotorConfig[]>([]);
  const [draftSensors, setDraftSensors] = useState<SensorConfig[]>([]);
  const [draftWheelDiameter, setDraftWheelDiameter] = useState<number>(5.6);
  const [draftWheelDistance, setDraftWheelDistance] = useState<number>(11.5);
  const [draftMaxMotorSpeed, setDraftMaxMotorSpeed] = useState<number>(100);

  const getPortConflicts = (mList: MotorConfig[], sList: SensorConfig[]) => {
    const usage: Record<string, string[]> = {};
    mList.forEach(m => {
      const p = m.port ? m.port.trim().toUpperCase() : '';
      if (p) {
        const label = language === 'en' ? `Motor ${m.id}` : `Motore ${m.id}`;
        if (!usage[p]) usage[p] = [];
        usage[p].push(label);
      }
    });
    sList.forEach(s => {
      const p = s.port ? s.port.trim().toUpperCase() : '';
      if (p) {
        const label = language === 'en' ? `Sensor ${s.id}` : `Sensore ${s.id}`;
        if (!usage[p]) usage[p] = [];
        usage[p].push(label);
      }
    });
    const conflicts: Record<string, string[]> = {};
    Object.entries(usage).forEach(([p, devs]) => {
      if (devs.length > 1) {
        conflicts[p] = devs;
      }
    });
    return conflicts;
  };

  const handleOpenSetup = () => {
    setDraftMotors(JSON.parse(JSON.stringify(motors)));
    setDraftSensors(JSON.parse(JSON.stringify(sensors)));
    setDraftWheelDiameter(wheelDiameter);
    setDraftWheelDistance(wheelDistance);
    setDraftMaxMotorSpeed(maxMotorSpeed);
    setIsSetupOpen(true);
  };

  const handleDraftMotorChange = (id: number, field: keyof MotorConfig, value: any) => {
    setDraftMotors(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const handleDraftSensorChange = (id: number, field: keyof SensorConfig, value: any) => {
    setDraftSensors(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleDraftResetToDefault = () => {
    const defaultMotors = [
      { id: 1, port: 'C', isTraction: true, isInverted: true },
      { id: 2, port: 'D', isTraction: true, isInverted: false },
      { id: 3, port: 'E', isTraction: false, isInverted: false },
      { id: 4, port: '', isTraction: false, isInverted: false },
    ];
    const defaultSensors = [
      { id: 1, port: 'A', type: 'force', direction: 'down' as const },
      { id: 2, port: 'B', type: 'color', direction: 'forward' as const },
      { id: 3, port: 'F', type: 'distance', direction: 'down' as const },
      { id: 4, port: '', type: '', direction: 'down' as const },
    ];
    setDraftMotors(defaultMotors);
    setDraftSensors(defaultSensors);
    setDraftWheelDiameter(5.6);
    setDraftWheelDistance(11.5);
    setDraftMaxMotorSpeed(100);
  };

  const handleSaveSetup = () => {
    const conflicts = getPortConflicts(draftMotors, draftSensors);
    if (Object.keys(conflicts).length > 0) {
      return;
    }

    const motorPortMap: Record<string, string> = {};
    motors.forEach(oldM => {
      const newM = draftMotors.find(m => m.id === oldM.id);
      if (newM && oldM.port && newM.port && oldM.port !== newM.port) {
        motorPortMap[oldM.port] = newM.port;
      }
    });

    const sensorPortMap: Record<string, string> = {};
    sensors.forEach(oldS => {
      const newS = draftSensors.find(s => s.id === oldS.id);
      if (newS && oldS.port && newS.port && oldS.port !== newS.port) {
        sensorPortMap[oldS.port] = newS.port;
      }
    });

    setMotors(draftMotors);
    setSensors(draftSensors);
    setWheelDiameter(draftWheelDiameter);
    setWheelDistance(draftWheelDistance);
    setMaxMotorSpeed(draftMaxMotorSpeed);

    localStorage.setItem('spike_motors', JSON.stringify(draftMotors));
    localStorage.setItem('spike_sensors', JSON.stringify(draftSensors));
    localStorage.setItem('spike_wheel_diameter', draftWheelDiameter.toString());
    localStorage.setItem('spike_wheel_distance', draftWheelDistance.toString());
    localStorage.setItem('spike_max_motor_speed', draftMaxMotorSpeed.toString());

    localStorage.setItem(`spike_slot_${currentSlot}_motors`, JSON.stringify(draftMotors));
    localStorage.setItem(`spike_slot_${currentSlot}_sensors`, JSON.stringify(draftSensors));
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_diameter`, draftWheelDiameter.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_distance`, draftWheelDistance.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_max_motor_speed`, draftMaxMotorSpeed.toString());

    const traction = draftMotors.filter(m => m.isTraction && m.port);
    const left = traction[0] || draftMotors.find(m => m.port) || { port: 'C', isInverted: true };
    const rem = draftMotors.filter(m => m.port && m.port !== left.port);
    const right = traction[1] || rem[0] || { port: 'D', isInverted: false };

    let newFullCode: string | null = null;
    if (blocklyEditorRef.current) {
      newFullCode = blocklyEditorRef.current.updateHardwareConfig(
        draftMotors,
        draftSensors,
        motorPortMap,
        sensorPortMap
      );
    }

    if (newFullCode) {
      setBlocklyCode(newFullCode);
      setCustomCode(prev => {
        if (activeTab === 'blocks' || !prev || prev === blocklyCode) {
          localStorage.setItem(`spike_slot_${currentSlot}_python`, newFullCode!);
          return newFullCode!;
        }
        const updated = updatePythonCodePorts(prev, left, right, motorPortMap, sensorPortMap);
        localStorage.setItem(`spike_slot_${currentSlot}_python`, updated);
        return updated;
      });
    } else {
      setCustomCode(prev => {
        const updated = updatePythonCodePorts(prev, left, right, motorPortMap, sensorPortMap);
        setBlocklyCode(updated);
        localStorage.setItem(`spike_slot_${currentSlot}_python`, updated);
        return updated;
      });
    }

    if (blocklyEditorRef.current) {
      try {
        const ws = blocklyEditorRef.current.saveWorkspace();
        if (ws) {
          localStorage.setItem(`spike_slot_${currentSlot}_workspace`, JSON.stringify(ws));
        }
      } catch (e) {}
    }

    setIsSetupOpen(false);
  };

  const handleMaxMotorSpeedChange = (val: number) => {
    setMaxMotorSpeed(val);
    localStorage.setItem('spike_max_motor_speed', val.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_max_motor_speed`, val.toString());
  };

  const handleWheelDiameterChange = (val: number) => {
    setWheelDiameter(val);
    localStorage.setItem('spike_wheel_diameter', val.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_diameter`, val.toString());
  };

  const handleWheelDistanceChange = (val: number) => {
    setWheelDistance(val);
    localStorage.setItem('spike_wheel_distance', val.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_distance`, val.toString());
  };

  const handleMotorChange = (id: number, field: keyof MotorConfig, value: any) => {
    setMotors(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, [field]: value } : m);
      localStorage.setItem('spike_motors', JSON.stringify(updated));
      localStorage.setItem(`spike_slot_${currentSlot}_motors`, JSON.stringify(updated));
      return updated;
    });
  };

  const handleSensorChange = (id: number, field: keyof SensorConfig, value: any) => {
    setSensors(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, [field]: value } : s);
      localStorage.setItem('spike_sensors', JSON.stringify(updated));
      localStorage.setItem(`spike_slot_${currentSlot}_sensors`, JSON.stringify(updated));
      return updated;
    });
  };

  const resetToDefaultSetup = () => {
    const defaultMotors = [
      { id: 1, port: 'C', isTraction: true, isInverted: true },
      { id: 2, port: 'D', isTraction: true, isInverted: false },
      { id: 3, port: 'E', isTraction: false, isInverted: false },
      { id: 4, port: '', isTraction: false, isInverted: false },
    ];
    const defaultSensors = [
      { id: 1, port: 'A', type: 'force', direction: 'down' },
      { id: 2, port: 'B', type: 'color', direction: 'forward' },
      { id: 3, port: 'F', type: 'distance', direction: 'down' },
      { id: 4, port: '', type: '', direction: 'down' },
    ];
    setMotors(defaultMotors);
    setSensors(defaultSensors);
    setWheelDiameter(5.6);
    setWheelDistance(11.5);
    setMaxMotorSpeed(100);

    localStorage.setItem('spike_motors', JSON.stringify(defaultMotors));
    localStorage.setItem('spike_sensors', JSON.stringify(defaultSensors));
    localStorage.setItem('spike_wheel_diameter', '5.6');
    localStorage.setItem('spike_wheel_distance', '11.5');
    localStorage.setItem('spike_max_motor_speed', '100');

    // Also update current slot specifically
    localStorage.setItem(`spike_slot_${currentSlot}_motors`, JSON.stringify(defaultMotors));
    localStorage.setItem(`spike_slot_${currentSlot}_sensors`, JSON.stringify(defaultSensors));
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_diameter`, '5.6');
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_distance`, '11.5');
    localStorage.setItem(`spike_slot_${currentSlot}_max_motor_speed`, '100');
  };

  const handleBlocklyCodeChange = useCallback((code: string) => {
    setBlocklyCode(code);
    setCustomCode(code);
  }, []);

  const blocklyEditorRef = useRef<BlocklyEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileBlockInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Clear all slot workspace and python code from localStorage on app launch/restart
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      localStorage.removeItem(`spike_slot_${i}_workspace`);
      localStorage.removeItem(`spike_slot_${i}_python`);
      localStorage.removeItem(`spike_slot_${i}_motors`);
      localStorage.removeItem(`spike_slot_${i}_sensors`);
      localStorage.removeItem(`spike_slot_${i}_wheel_diameter`);
      localStorage.removeItem(`spike_slot_${i}_wheel_distance`);
      localStorage.removeItem(`spike_slot_${i}_max_motor_speed`);
    }
    localStorage.setItem('spike_current_slot', '0');
    setCurrentSlot(0);
    
    // We delay slightly to ensure blockly is mounted before loading
    setTimeout(() => {
      loadSlotData(0);
    }, 600);
  }, []);

  const loadSlotData = (slot: number) => {
    const savedWorkspace = localStorage.getItem(`spike_slot_${slot}_workspace`);
    if (savedWorkspace && blocklyEditorRef.current) {
        blocklyEditorRef.current.loadWorkspace(JSON.parse(savedWorkspace));
    } else if (blocklyEditorRef.current) {
        blocklyEditorRef.current.loadWorkspace(null); // Clear workspace
    }
    const savedPython = localStorage.getItem(`spike_slot_${slot}_python`);
    if (savedPython) {
        setCustomCode(savedPython);
        setBlocklyCode(savedPython);
    } else {
        setCustomCode('');
        setBlocklyCode('');
    }

    // Load slot-specific robot configuration
    const savedMotors = localStorage.getItem(`spike_slot_${slot}_motors`);
    if (savedMotors) {
      try {
        setMotors(JSON.parse(savedMotors));
      } catch (e) {
        console.error("Errore nel parsing dei motori del slot:", e);
      }
    } else {
      const globalMotors = localStorage.getItem('spike_motors');
      if (globalMotors) {
        try {
          setMotors(JSON.parse(globalMotors));
        } catch (e) {}
      } else {
        setMotors([
          { id: 1, port: 'C', isTraction: true, isInverted: true },
          { id: 2, port: 'D', isTraction: true, isInverted: false },
          { id: 3, port: 'E', isTraction: false, isInverted: false },
          { id: 4, port: '', isTraction: false, isInverted: false },
        ]);
      }
    }

    const savedSensors = localStorage.getItem(`spike_slot_${slot}_sensors`);
    if (savedSensors) {
      try {
        setSensors(JSON.parse(savedSensors));
      } catch (e) {
        console.error("Errore nel parsing dei sensori del slot:", e);
      }
    } else {
      const globalSensors = localStorage.getItem('spike_sensors');
      if (globalSensors) {
        try {
          setSensors(JSON.parse(globalSensors));
        } catch (e) {}
      } else {
        setSensors([
          { id: 1, port: 'A', type: 'force', direction: 'down' },
          { id: 2, port: 'B', type: 'color', direction: 'forward' },
          { id: 3, port: 'F', type: 'distance', direction: 'down' },
          { id: 4, port: '', type: '', direction: 'down' },
        ]);
      }
    }

    const savedWheelDiameter = localStorage.getItem(`spike_slot_${slot}_wheel_diameter`);
    if (savedWheelDiameter) {
      setWheelDiameter(parseFloat(savedWheelDiameter));
    } else {
      const globalWheelDiameter = localStorage.getItem('spike_wheel_diameter');
      setWheelDiameter(globalWheelDiameter ? parseFloat(globalWheelDiameter) : 5.6);
    }

    const savedWheelDistance = localStorage.getItem(`spike_slot_${slot}_wheel_distance`);
    if (savedWheelDistance) {
      setWheelDistance(parseFloat(savedWheelDistance));
    } else {
      const globalWheelDistance = localStorage.getItem('spike_wheel_distance');
      setWheelDistance(globalWheelDistance ? parseFloat(globalWheelDistance) : 11.5);
    }

    const savedMaxMotorSpeed = localStorage.getItem(`spike_slot_${slot}_max_motor_speed`);
    if (savedMaxMotorSpeed) {
      setMaxMotorSpeed(parseInt(savedMaxMotorSpeed));
    } else {
      const globalMaxMotorSpeed = localStorage.getItem('spike_max_motor_speed');
      setMaxMotorSpeed(globalMaxMotorSpeed ? parseInt(globalMaxMotorSpeed) : 100);
    }
  };

  const handleSlotChange = (newSlot: number) => {
    if (newSlot === currentSlot) return;
    // Save current workspace and code
    if (blocklyEditorRef.current) {
      const workspace = blocklyEditorRef.current.saveWorkspace();
      if (workspace) {
         localStorage.setItem(`spike_slot_${currentSlot}_workspace`, JSON.stringify(workspace));
      } else {
         localStorage.removeItem(`spike_slot_${currentSlot}_workspace`);
      }
    }
    localStorage.setItem(`spike_slot_${currentSlot}_python`, activeTab === 'blocks' ? blocklyCode : customCode);
    
    // Save current robot configuration
    localStorage.setItem(`spike_slot_${currentSlot}_motors`, JSON.stringify(motors));
    localStorage.setItem(`spike_slot_${currentSlot}_sensors`, JSON.stringify(sensors));
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_diameter`, wheelDiameter.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_distance`, wheelDistance.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_max_motor_speed`, maxMotorSpeed.toString());

    // Switch
    setCurrentSlot(newSlot);
    localStorage.setItem('spike_current_slot', newSlot.toString());
    loadSlotData(newSlot);
  };

  const uploadMultiProgramMenu = async () => {
    if (!port || !port.writable || isExecuting) return;
    
    if (blocklyEditorRef.current) {
      const workspace = blocklyEditorRef.current.saveWorkspace();
      if (workspace) localStorage.setItem(`spike_slot_${currentSlot}_workspace`, JSON.stringify(workspace));
    }
    localStorage.setItem(`spike_slot_${currentSlot}_python`, activeTab === 'blocks' ? blocklyCode : customCode);
    
    // Save current robot configuration for the active slot
    localStorage.setItem(`spike_slot_${currentSlot}_motors`, JSON.stringify(motors));
    localStorage.setItem(`spike_slot_${currentSlot}_sensors`, JSON.stringify(sensors));
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_diameter`, wheelDiameter.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_wheel_distance`, wheelDistance.toString());
    localStorage.setItem(`spike_slot_${currentSlot}_max_motor_speed`, maxMotorSpeed.toString());

    const stringToHex = (str: string): string => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(str);
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    };

    const slotsData: { [key: number]: string } = {};
    const activeSlots: number[] = [];
    
    for (let i = 0; i < TOTAL_SLOTS; i++) {
        let code = i === currentSlot ? (activeTab === 'blocks' ? blocklyCode : customCode) : localStorage.getItem(`spike_slot_${i}_python`) || '';
        
        if (code && code.trim().length > 50) {
            slotsData[i] = code;
            activeSlots.push(i);
        }
    }
    
    if (activeSlots.length === 0) {
        alert("Nessun programma trovato da caricare nel menu.");
        return;
    }

    if ((port as any).protocol === 'spike3') {
      setIsExecuting(true);
      try {
        setLogs(prev => prev + "\n=== INIZIO CARICAMENTO MULTI-PROGRAMMA SPIKE 3 ===\n");
        for (const slot of activeSlots) {
          setLogs(prev => prev + `Caricamento Programma nel Slot ${slot}... `);
          const rawCode = slotsData[slot];
          const success = await (port as any).uploadSpike3Program(rawCode, slot, `program.py`);
          if (success) {
            setLogs(prev => prev + "Completato! ✅\n");
          } else {
            setLogs(prev => prev + "Errore ❌\n");
            throw new Error(`Caricamento fallito per lo slot ${slot}`);
          }
        }
        setLogs(prev => prev + "[Tutti i programmi sono stati caricati con successo nei rispettivi slot del robot! Seleziona lo slot desiderato sul display del robot per eseguirlo.]\n");
      } catch (err: any) {
        console.error(err);
        setLogs(prev => prev + `Errore nel caricamento: ${err.message || err}\n`);
      } finally {
        setIsExecuting(false);
      }
      return;
    }

    if (port.writable.locked) {
        setLogs(prev => prev + "Porta seriale bloccata. Prova a ricollegare.\n");
        return;
    }

    setIsExecuting(true);
    let writer = null;

    try {
      writer = port.writable.getWriter();
      const encoder = new TextEncoder();

      // Helper to send a piece of code via Paste Mode (Ctrl+E) and execute it (Ctrl+D)
      const sendPasteCode = async (codeToSend: string) => {
        // Stop current running program (Ctrl+C)
        await writer.write(encoder.encode('\x03'));
        await new Promise(r => setTimeout(r, 150));
        
        // Enter Paste Mode (Ctrl+E)
        await writer.write(encoder.encode('\x05'));
        await new Promise(r => setTimeout(r, 150));
        
        // Send the code in chunks
        const encoded = encoder.encode(codeToSend + '\r\n');
        const CHUNK_SIZE = 128;
        const CHUNK_DELAY = 10;
        for (let offset = 0; offset < encoded.length; offset += CHUNK_SIZE) {
          const chunk = encoded.slice(offset, offset + CHUNK_SIZE);
          await writer.write(chunk);
          await new Promise(r => setTimeout(r, CHUNK_DELAY));
        }
        
        // Execute Paste (Ctrl+D)
        await writer.write(encoder.encode('\x04'));
        await new Promise(r => setTimeout(r, 150));
      };

      setLogs(prev => prev + "\n=== INIZIO CARICAMENTO MULTI-PROGRAMMA ===\n");

      // 1. Write each active slot program to its own file in flash memory
      for (const slot of activeSlots) {
        setLogs(prev => prev + `Caricamento Programma ${slot}... `);
        const rawCode = slotsData[slot];
        const hexCode = stringToHex(rawCode);

        // We use hex format to make it safe from newlines/quotes, and write bytes directly
        const writeScript = `import ubinascii
with open('slot_${slot}.py', 'wb') as f:
    f.write(ubinascii.unhexlify('${hexCode}'))
`;
        await sendPasteCode(writeScript);
        // Allow flash write operation to settle
        await new Promise(r => setTimeout(r, 350));
        setLogs(prev => prev + "Completato! ✅\n");
      }

      // 2. Build and upload the selection menu program
      setLogs(prev => prev + "Generazione menu di selezione sul robot... ");
      
      const activeSlotsArrayStr = `[${activeSlots.join(', ')}]`;
      const menuCode = `import hub, utime, sys, gc
from hub import light_matrix, button
try:
    from hub import status_light
except ImportError:
    status_light = None

available_slots = ${activeSlotsArrayStr}
current_index = 0

def show_slot():
    slot = available_slots[current_index]
    light_matrix.write(str(slot))

def check_btn(btn_name):
    try:
        if hasattr(button, 'pressed') and hasattr(button, btn_name): 
            return button.pressed(getattr(button, btn_name))
        
        btn_lower = btn_name.lower()
        if hasattr(button, btn_lower): 
            b = getattr(button, btn_lower)
            if hasattr(b, 'was_pressed'): return b.was_pressed()
            if hasattr(b, 'is_pressed'): return b.is_pressed()
            if hasattr(b, 'pressed'):
                if callable(b.pressed): return b.pressed()
                else: return b.pressed
    except: pass
    return False

try:
    show_slot()
    print("Menu avviato. Usa Sinistra/Destra per navigare, Centrale (o Sinistra+Destra) per selezionare.")
    if status_light:
        try: status_light.on('white')
        except: pass

    while True:
        utime.sleep_ms(50)
        btn_center = check_btn('CENTER') or check_btn('POWER') or (check_btn('LEFT') and check_btn('RIGHT'))
        
        if btn_center:
            light_matrix.clear()
            slot = available_slots[current_index]
            print("Avvio slot", slot)
            
            for _ in range(3):
                light_matrix.write(str(slot))
                utime.sleep_ms(150)
                light_matrix.clear()
                utime.sleep_ms(150)
                
            try:
                gc.collect()
                filename = 'slot_{}.py'.format(slot)
                with open(filename, 'r', encoding='utf-8') as f:
                    source_code = f.read()
                
                prog_globals = {
                    '__name__': '__main__',
                    'hub': hub,
                    'utime': utime,
                    'sys': sys,
                }
                if hasattr(globals, '__builtins__'):
                    prog_globals['__builtins__'] = globals()['__builtins__']
                
                exec(source_code, prog_globals)
                gc.collect()
            except KeyboardInterrupt:
                raise
            except Exception as e:
                print("Errore slot", slot, ":", e)
                try:
                    light_matrix.write("X")
                    utime.sleep_ms(2000)
                except: pass
                
            print("Terminato, ritorno al menu.")
            if status_light:
                try: status_light.on('white')
                except: pass
            utime.sleep_ms(500)
            show_slot()
        elif check_btn('LEFT'):
            current_index = (current_index - 1) % len(available_slots)
            show_slot()
            utime.sleep_ms(300)
        elif check_btn('RIGHT'):
            current_index = (current_index + 1) % len(available_slots)
            show_slot()
            utime.sleep_ms(300)
except KeyboardInterrupt:
    print("Menu interrotto.")
except Exception as root_e:
    print("Errore critico menu:", root_e)
    try:
        light_matrix.write("E")
        utime.sleep_ms(2000)
    except: pass
`;

      await sendPasteCode(menuCode);
      await new Promise(r => setTimeout(r, 200));
      setLogs('');
      setLogs(prev => prev + "[Menu caricato con successo! Usa i tasti Sinistra/Destra del robot per scegliere il programma, premi Centrale per avviarlo!]\n");
    } catch (err: any) {
      console.error(err);
      setLogs(prev => prev + `Errore nel caricamento: ${err.message}\n`);
    } finally {
      if (writer) {
        try {
          writer.releaseLock();
        } catch (e) {}
      }
      setIsExecuting(false);
    }
  };

  const handleSaveProgram = () => {
    let workspaceData = null;
    if (blocklyEditorRef.current) {
      workspaceData = blocklyEditorRef.current.saveWorkspace();
    }
    
    const fileData = {
      type: 'spike-program',
      version: 1,
      motors,
      sensors,
      wheelDiameter,
      wheelDistance,
      maxMotorSpeed,
      workspace: workspaceData,
      pythonCode: customCode
    };
    
    const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'programma_spike.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadProgramClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        if (data.type !== 'spike-program') {
          alert("Il file selezionato non è un programma Spike valido.");
          return;
        }
        
        const isBlockly = data.workspace && data.workspace.blocks && data.workspace.blocks.blocks && data.workspace.blocks.blocks.length > 0;
        
        if (isBlockly) {
          setActiveTab('blocks');
          setTimeout(() => {
            if (data.workspace && blocklyEditorRef.current) {
              blocklyEditorRef.current.loadWorkspace(data.workspace);
            }
          }, 100);
        } else {
          setActiveTab('python');
          if (blocklyEditorRef.current) {
            blocklyEditorRef.current.loadWorkspace(null);
          }
        }
        
        if (data.motors) {
          setMotors(data.motors);
          localStorage.setItem('spike_motors', JSON.stringify(data.motors));
          localStorage.setItem(`spike_slot_${currentSlot}_motors`, JSON.stringify(data.motors));
        }
        if (data.sensors) {
          setSensors(data.sensors);
          localStorage.setItem('spike_sensors', JSON.stringify(data.sensors));
          localStorage.setItem(`spike_slot_${currentSlot}_sensors`, JSON.stringify(data.sensors));
        }
        if (data.wheelDiameter !== undefined) {
          setWheelDiameter(data.wheelDiameter);
          localStorage.setItem('spike_wheel_diameter', data.wheelDiameter.toString());
          localStorage.setItem(`spike_slot_${currentSlot}_wheel_diameter`, data.wheelDiameter.toString());
        }
        if (data.wheelDistance !== undefined) {
          setWheelDistance(data.wheelDistance);
          localStorage.setItem('spike_wheel_distance', data.wheelDistance.toString());
          localStorage.setItem(`spike_slot_${currentSlot}_wheel_distance`, data.wheelDistance.toString());
        }
        if (data.maxMotorSpeed !== undefined) {
          setMaxMotorSpeed(data.maxMotorSpeed);
          localStorage.setItem('spike_max_motor_speed', data.maxMotorSpeed.toString());
          localStorage.setItem(`spike_slot_${currentSlot}_max_motor_speed`, data.maxMotorSpeed.toString());
        }
        
        if (data.pythonCode !== undefined) {
          setCustomCode(data.pythonCode);
          setBlocklyCode(data.pythonCode);
          localStorage.setItem(`spike_slot_${currentSlot}_python`, data.pythonCode);
        }
        if (data.workspace) {
          localStorage.setItem(`spike_slot_${currentSlot}_workspace`, JSON.stringify(data.workspace));
        } else {
          localStorage.removeItem(`spike_slot_${currentSlot}_workspace`);
        }
        
        alert("Programma caricato con successo!");
      } catch (err) {
        console.error("Errore nel caricamento del file:", err);
        alert("Errore nel caricamento del file. Assicurati che sia un file JSON valido.");
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSaveBlock = () => {
    if (!blocklyEditorRef.current) return;
    const blockData = blocklyEditorRef.current.saveSelectedBlock();
    if (!blockData) {
      alert("Nessun blocco selezionato. Clicca su un blocco per selezionarlo e riprova.");
      return;
    }
    
    const fileData = {
      type: 'spike-block',
      version: 1,
      blockData
    };
    
    const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blocco_spike.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadBlockClick = () => {
    if (fileBlockInputRef.current) {
      fileBlockInputRef.current.click();
    }
  };

  const handleBlockFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        if (data.type !== 'spike-block') {
          alert("Il file selezionato non è un blocco Spike valido.");
          return;
        }
        
        setActiveTab('blocks');
        
        setTimeout(() => {
          if (data.blockData && blocklyEditorRef.current) {
            blocklyEditorRef.current.appendBlock(data.blockData);
          }
        }, 100);
        
      } catch (err) {
        console.error("Errore nel caricamento del file:", err);
        alert("Errore nel caricamento del file. Assicurati che sia un file JSON valido.");
      }
      
      if (fileBlockInputRef.current) {
        fileBlockInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const terminalRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef<boolean>(false);
  const readLoopPromiseRef = useRef<Promise<void> | null>(null);
  const isBatteryScriptUploadedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isConnected || !port) {
      isBatteryScriptUploadedRef.current = false;
    }
  }, [isConnected, port]);

  useEffect(() => {
    if (!('serial' in navigator)) {
      setIsSerialSupported(false);
    }
    if (!('bluetooth' in navigator)) {
      setIsBluetoothSupported(false);
    }
    if (typeof window !== 'undefined' && window.self !== window.top) {
      setIsInIframe(true);
    }
  }, []);

  const queryBatteryFromRobot = useCallback(async () => {
    if (!port || isExecuting) return;
    
    const queryCode = `import hub
try:
    v = hub.battery_voltage()
    c = hub.battery_current()
    t = hub.battery_temperature()
    print("BATT_INFO:v={},c={},t={}".format(v, c, t))
except:
    try:
        v = hub.battery.voltage()
        c = hub.battery.current()
        t = hub.battery.temperature()
        print("BATT_INFO:v={},c={},t={}".format(v, c, t))
    except:
        pass
`;

    try {
      const isSpike3 = (port as any).protocol === 'spike3';
      if (!isSpike3 && port.writable) {
        if (!port.writable.locked) {
          const writer = port.writable.getWriter();
          const encoder = new TextEncoder();
          await writer.write(encoder.encode(String.fromCharCode(3) + String.fromCharCode(5)));
          await new Promise(r => setTimeout(r, 80));
          await writer.write(encoder.encode(queryCode + '\r\n'));
          await new Promise(r => setTimeout(r, 80));
          await writer.write(encoder.encode(String.fromCharCode(4)));
          writer.releaseLock();
        }
      } else if (isSpike3) {
        if (port.writable && !port.writable.locked) {
          if (!isBatteryScriptUploadedRef.current) {
            await (port as any).uploadSpike3Program(queryCode, 5, "battery.py");
            isBatteryScriptUploadedRef.current = true;
            await new Promise(r => setTimeout(r, 100));
          }
          await (port as any).startSpike3Program(5);
        }
      }
    } catch (err) {
      console.warn("Errore durante l'interrogazione automatica della batteria:", err);
    }
  }, [port, isExecuting]);

  useEffect(() => {
    if (!isConnected || !port || isExecuting || isVirtualActive || !isSetupOpen) return;

    // Leggi una volta all'apertura del pannello Setup
    queryBatteryFromRobot();
    
    // Evitiamo il polling continuo ogni 15 secondi per eliminare paranoie,
    // interruzioni improvvise di programmi in esecuzione o congestioni sulla porta seriale.
    // L'utente può aggiornare quando desidera usando il pulsante "Aggiorna".
  }, [isConnected, port, isExecuting, isVirtualActive, isSetupOpen, queryBatteryFromRobot]);

  useEffect(() => {
    if (!port) return;
    
    keepReadingRef.current = true;

    async function readLoop() {
      while (port && port.readable && keepReadingRef.current) {
        try {
          const reader = port.readable.getReader();
          readerRef.current = reader;
          try {
            while (keepReadingRef.current) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              if (value) {
                const text = new TextDecoder().decode(value);
                setLogs(prev => {
                  const newLogs = prev + text;
                  
                  // Extract battery telemetry if present (supporting float values)
                  const batteryMatch = newLogs.match(/BATT_INFO:v=(-?\d+(?:\.\d+)?),c=(-?\d+(?:\.\d+)?),t=(-?\d+(?:\.\d+)?)/);
                  if (batteryMatch) {
                    const v = parseFloat(batteryMatch[1]);
                    const c = parseFloat(batteryMatch[2]);
                    const t = parseFloat(batteryMatch[3]);
                    
                    setTimeout(() => {
                      setBatteryState({
                        voltage: v,
                        current: c,
                        temperature: t,
                        percentage: Math.max(0, Math.min(100, Math.round(((v - 6400) / 1800) * 100))),
                        lastUpdated: new Date()
                      });
                    }, 0);

                    // Clean the BATT_INFO line from logs to keep terminal pristine
                    const cleanedLogs = newLogs.replace(/BATT_INFO:v=-?\d+(?:\.\d+)?,c=-?\d+(?:\.\d+)?,t=-?\d+(?:\.\d+)?\r?\n?/, '');
                    return cleanedLogs.length > 5000 ? cleanedLogs.slice(-5000) : cleanedLogs;
                  }
                  
                  return newLogs.length > 5000 ? newLogs.slice(-5000) : newLogs;
                });
              }
            }
          } catch (error: any) {
            if (keepReadingRef.current) {
              console.error("Errore di lettura:", error);
              if (error.message && error.message.includes("The device has been lost")) {
                setLogs(prev => prev + "\n[Disconnesso: Il dispositivo è stato rimosso]\n");
                keepReadingRef.current = false;
                setIsConnected(false);
                setPort(null);
                break;
              }
            }
          } finally {
            readerRef.current = null;
            try {
              reader.releaseLock();
            } catch (e) {
              // Ignore release errors
            }
          }
        } catch (err) {
          if (keepReadingRef.current) {
            console.error("Errore nell'ottenere il reader:", err);
          }
          break;
        }
      }
    }

    readLoopPromiseRef.current = readLoop();

    return () => {
      keepReadingRef.current = false;
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
    };
  }, [port]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const connect = async () => {
    if (isConnected || port) {
      setLogs(prev => prev + "Esiste già una connessione attiva. Disconnettiti prima di procedere.\n");
      return;
    }

    try {
      const p = await (navigator as any).serial.requestPort();
      await p.open({ baudRate: 115200 });

      const wrapped = new WrappedSerialPort(p);
      wrapped.startInternalReadLoop();

      setLogs(prev => prev + "Rilevamento protocollo robot in corso su USB...\n");
      const detected = await wrapped.detectProtocol();

      setPort(wrapped);
      setIsConnected(true);

      if (detected === 'spike3') {
        setLogs(prev => prev + "Connesso a LEGO Spike Prime (USB).\nSupporto Firmware SPIKE 3 attivo. I programmi verranno inviati direttamente nel menu degli slot nativo.\n");
      } else {
        setLogs(prev => prev + "Connesso a LEGO Spike Prime (USB-REPL).\nSupporto Firmware SPIKE 2 attivo (REPL).\n");
        // Svuota lo schermo del robot alla connessione
        try {
          const writer = wrapped.writable.getWriter();
          const encoder = new TextEncoder();
          // Invia Ctrl+C per sicurezza e poi il comando clear
          await writer.write(encoder.encode('\x03\r\nfrom hub import light_matrix\r\nlight_matrix.clear()\r\n'));
          writer.releaseLock();
        } catch (e) {
          console.error("Errore nel reset iniziale dello schermo:", e);
        }
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        // L'utente ha annullato la selezione della porta
        return;
      }
      console.error(err);
      setLogs(prev => prev + `Errore di connessione: ${err.message}\n`);
    }
  };

  const connectBluetooth = async () => {
    if (isConnected || port) {
      setLogs(prev => prev + "Esiste già una connessione seriale. Disconnettiti prima di procedere con il Bluetooth.\n");
      return;
    }

    try {
      setLogs(prev => prev + "Richiesta dispositivo Bluetooth...\n");
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
          'c5f50001-8280-46da-89f4-6d8051e4aeef',
          '00001623-1212-efde-1623-785feabcd123',
          '0000fd02-0000-1000-8000-00805f9b34fb'
        ]
      });
      setLogs(prev => prev + `Dispositivo selezionato: ${device.name || 'Sconosciuto'}. Connessione GATT in corso...\n`);
      const btPort = new BluetoothSerialPort(device);
      btPort.onDisconnect = () => {
        setLogs(prev => prev + "Dispositivo Bluetooth disconnesso.\n");
        setIsConnected(false);
        setPort(null);
        setBatteryState({
          voltage: null,
          current: null,
          temperature: null,
          percentage: null,
          lastUpdated: null,
        });
      };
      await btPort.open();
      setLogs(prev => prev + "Servizi GATT trovati. Setup completato.\n");
      setPort(btPort);
      setIsConnected(true);
      setLogs(prev => prev + "Connesso a LEGO Spike Prime (Bluetooth).\n");
      
      if ((btPort as any).protocol === 'spike3') {
        setLogs(prev => prev + "Supporto Firmware SPIKE 3 attivo. I programmi verranno inviati direttamente nel menu degli slot nativo.\n");
      } else {
        // Svuota lo schermo del robot alla connessione
        try {
          const writer = btPort.writable.getWriter();
          const encoder = new TextEncoder();
          // Invia Ctrl+C per sicurezza e poi il comando clear
          await writer.write(encoder.encode('\x03\r\nfrom hub import light_matrix\r\nlight_matrix.clear()\r\n'));
          writer.releaseLock();
        } catch (e) {
          console.error("Errore nel reset iniziale dello schermo:", e);
        }
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return;
      }
      console.error(err);
      if (err.message && err.message.includes('permissions policy')) {
        alert("Il browser impedisce l'uso del Bluetooth in questo riquadro (iframe). Per usare il Bluetooth, per favore apri l'app in una nuova scheda usando il pulsante in alto a destra o l'avviso arancione.");
        setIsBluetoothSupported(false);
      } else {
        alert(`Errore Bluetooth: ${err.message || JSON.stringify(err)}`);
      }
      setLogs(prev => prev + `Errore di connessione Bluetooth: ${err.message || JSON.stringify(err)}\n`);
    }
  };

  const disconnect = async () => {
    if (port) {
      try {
        // Prima di disconnettere, inviamo un Ctrl+C (\x03) per interrompere eventuali cicli pendenti o modalità incolla,
        // e un Ctrl+D (\x04) per eseguire il soft-reboot della VM MicroPython.
        // Questo sblocca il firmware del robot e riattiva il corretto funzionamento dei tasti fisici (incluso il tasto Bluetooth).
        try {
          const isSpike3 = (port as any).protocol === 'spike3';
          if (!isSpike3 && port.writable) {
            const writer = port.writable.getWriter();
            const encoder = new TextEncoder();
            await writer.write(encoder.encode('\x03\x04'));
            writer.releaseLock();
            await new Promise(r => setTimeout(r, 150));
          }
        } catch (e) {
          console.warn("Impossibile inviare i comandi di reset pre-disconnessione:", e);
        }

        // 1. Interrompi il ciclo impostando keepReadingRef su false
        keepReadingRef.current = false;

        // 2. Cancella il reader attivo per sbloccare la porta
        if (readerRef.current) {
          try {
            await readerRef.current.cancel();
          } catch (e) {
            console.error("Errore nella cancellazione del reader:", e);
          }
        }

        // 3. Attendi che il ciclo di lettura termini in sicurezza e rilasci i lock
        if (readLoopPromiseRef.current) {
          try {
            await readLoopPromiseRef.current;
          } catch (e) {
            console.error("Errore nell'attesa della chiusura del ciclo di lettura:", e);
          }
        }

        // 4. Chiudi la porta seriale
        await port.close();
        setPort(null);
        setIsConnected(false);
        setBatteryState({
          voltage: null,
          current: null,
          temperature: null,
          percentage: null,
          lastUpdated: null,
        });
        setLogs(prev => prev + "Disconnesso.\n");
      } catch (err: any) {
        console.error(err);
        setLogs(prev => prev + `Errore durante la disconnessione: ${err.message}\n`);
      }
    }
  };

  const executeCode = async (code: string, waitForButton: boolean = false) => {
    if (!port) {
      setLogs(prev => prev + "Errore: Porta seriale non disponibile.\n");
      return;
    }

    if (isExecuting) {
      setLogs(prev => prev + "Invio in corso, attendi...\n");
      return;
    }

    let finalCode = code;
    if (waitForButton) {
      setLogs(prev => prev + "\n[Attesa avvio (Spike 3): Premi il tasto SINISTRO o DESTRO sul robot per avviare il codice!]\n");
      finalCode = finalCode.replace('_WAIT_FIRST_TIME = False', '_WAIT_FIRST_TIME = True');
    }

    if ((port as any).protocol === 'spike3') {
      setIsExecuting(true);
      try {
        setLogs(prev => prev + `[SPIKE 3] Arresto programma in corso nello slot ${currentSlot}...\n`);
        await (port as any).stopSpike3Program(currentSlot);
        await new Promise(r => setTimeout(r, 50));

        setLogs(prev => prev + `[SPIKE 3] Caricamento programma nello slot ${currentSlot}...\n`);
        const success = await (port as any).uploadSpike3Program(finalCode, currentSlot, `program.py`, (progress: number) => {
          setLogs(prev => {
            const lines = prev.split('\n');
            const filtered = lines.filter(line => line && !line.startsWith('[SPIKE 3] Caricamento:'));
            return filtered.join('\n') + `\n[SPIKE 3] Caricamento: ${progress}%\n`;
          });
        });

        if (!success) {
          throw new Error("Caricamento del file fallito");
        }

        await new Promise(r => setTimeout(r, 100)); // Attendi che l'hub processi il file prima di avviarlo

        setLogs(prev => prev + `[SPIKE 3] Avvio programma nello slot ${currentSlot}...\n`);
        const started = await (port as any).startSpike3Program(currentSlot);
        if (started) {
          setLogs(prev => prev + `[SPIKE 3] Programma avviato correttamente nello slot ${currentSlot}! 🚀\n`);
        } else {
          setLogs(prev => prev + `[SPIKE 3] Errore nell'avvio del programma.\n`);
        }
      } catch (err: any) {
        console.error(err);
        setLogs(prev => prev + `[SPIKE 3] Errore: ${err.message || err}\n`);
      } finally {
        setIsExecuting(false);
      }
      return;
    }

    if (!port.writable) {
      setLogs(prev => prev + "Errore: Porta seriale non disponibile per la scrittura.\n");
      return;
    }

    if (port.writable.locked) {
      setLogs(prev => prev + "Porta seriale bloccata. Prova a ricollegare.\n");
      return;
    }

    setIsExecuting(true);
    let writer = null;

    try {
      writer = port.writable.getWriter();
      const encoder = new TextEncoder();
      
      // Stop current running program (Ctrl+C)
      await writer.write(encoder.encode('\x03'));
      await new Promise(r => setTimeout(r, 50));
      
      // Enter Paste Mode (Ctrl+E)
      await writer.write(encoder.encode('\x05'));
      await new Promise(r => setTimeout(r, 50));
      
      // Write the code in chunks to prevent UART buffer overflow on the Spike Prime
      const encodedCode = encoder.encode(finalCode + '\r\n');
      const CHUNK_SIZE = 256;
      const CHUNK_DELAY = 5; // ms
      for (let offset = 0; offset < encodedCode.length; offset += CHUNK_SIZE) {
        const chunk = encodedCode.slice(offset, offset + CHUNK_SIZE);
        await writer.write(chunk);
        await new Promise(r => setTimeout(r, CHUNK_DELAY));
      }
      
      // Execute (Ctrl+D)
      await writer.write(encoder.encode('\x04'));
      
      await new Promise(r => setTimeout(r, 50));
      setLogs('');
      if (waitForButton) {
        setLogs(prev => prev + "[Attesa avvio (Spike 3): Premi il tasto SINISTRO o DESTRO sul robot per avviare il codice!]\n");
      }
    } catch (err: any) {
      console.error(err);
      setLogs(prev => prev + `Errore di esecuzione: ${err.message}\n`);
    } finally {
      if (writer) {
        try {
          writer.releaseLock();
        } catch (e) {}
      }
      setIsExecuting(false);
    }
  };

  const stopExecution = async () => {
    if (!port) return;

    if ((port as any).protocol === 'spike3') {
      try {
        setLogs(prev => prev + `[SPIKE 3] Arresto del programma nello slot ${currentSlot}...\n`);
        const success = await (port as any).stopSpike3Program(currentSlot);
        if (success) {
          setLogs(prev => prev + `[SPIKE 3] Programma interrotto. Motori fermati. ✅\n`);
        } else {
          setLogs(prev => prev + `[SPIKE 3] Errore durante l'interruzione.\n`);
        }
      } catch (err: any) {
        console.error(err);
        setLogs(prev => prev + `[SPIKE 3] Errore: ${err.message || err}\n`);
      }
      return;
    }

    if (!port.writable) return;
    
    // Non blocchiamo se isExecuting è true, perché stopExecution è il tasto di emergenza.
    // Tuttavia, se port.writable.locked è true, getWriter fallirà.
    if (port.writable.locked) {
        setLogs(prev => prev + "Impossibile interrompere: porta seriale bloccata.\n");
        return;
    }

    let writer = null;
    try {
      writer = port.writable.getWriter();
      const encoder = new TextEncoder();
      
      // Send multiple Ctrl+C to ensure we break out of loops
      await writer.write(encoder.encode('\x03\x03\r\n'));
      
      // Wait for REPL to become responsive
      await new Promise(r => setTimeout(r, 300));
      
      // Attempt to stop all motors
      const stopCode = `
try:
    import motor_pair
    motor_pair.stop(motor_pair.PAIR_1)
except: pass
try:
    import motor, port
    for p in [port.A, port.B, port.C, port.D, port.E, port.F]:
        try: motor.stop(p)
        except: pass
except: pass
`;
      // Enter Paste Mode
      await writer.write(encoder.encode('\x05'));
      await new Promise(r => setTimeout(r, 100));
      
      // Write the code
      await writer.write(encoder.encode(stopCode + '\r\n'));
      await new Promise(r => setTimeout(r, 100));
      
      // Execute
      await writer.write(encoder.encode('\x04'));

      setLogs(prev => prev + "Esecuzione interrotta. Motori fermati.\n");
    } catch (err: any) {
      console.error(err);
    } finally {
        if (writer) {
            try {
                writer.releaseLock();
            } catch (e) {}
        }
        setIsExecuting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-yellow-300 selection:text-neutral-900">
      {/* Header */}
      <header className="bg-neutral-200 border-b border-neutral-300 sticky top-0 z-10">
        <div className="w-full px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-md flex items-center justify-center shadow-sm overflow-hidden bg-white border-2 border-black">
              <img src={logoStaarr} alt="Logo Staarr" className="w-full h-full object-contain" />
            </div>
            <h1 className="font-semibold tracking-tight text-3xl">BlueRobo(5)</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsVirtualActive(!isVirtualActive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all border-2 active:scale-95 ${isVirtualActive ? 'bg-red-600 hover:bg-red-700 text-white border-black shadow-inner' : 'bg-green-500 hover:bg-green-600 text-white border-black shadow-sm'}`}
              title={language === 'en' ? 'Simulator' : 'Simulatore'}
            >
              <span className="relative flex h-2 w-2">
                {isVirtualActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isVirtualActive ? 'bg-white' : 'bg-white'}`}></span>
              </span>
              {language === 'en' ? 'Simulator' : 'Simulatore'}
            </button>
            {!isVirtualActive && (
              <>
                <button
                  onClick={() => setShowTerminal(!showTerminal)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-2 ${showTerminal ? 'bg-neutral-300 text-neutral-900 border-black shadow-inner' : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-900 border-black shadow-sm'}`}
                  title={language === 'en' ? 'Serial Monitor' : 'Monitor Seriale'}
                >
                  <Terminal className="w-4 h-4" />
                  {language === 'en' ? 'Serial Monitor' : 'Monitor seriale'}
                </button>
                <button
                  onClick={() => setLanguage(language === 'it' ? 'en' : 'it')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all border-2 bg-blue-500 hover:bg-blue-600 text-white border-black shadow-sm active:scale-95"
                  title="Cambia lingua / Change language"
                >
                  <Globe className="w-4 h-4" />
                  {language === 'it' ? 'IT' : 'EN'}
                </button>
              </>
            )}
            <button 
              onClick={handleOpenSetup} 
              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 transition-colors"
              title="Setup Robot"
            >
              <Settings className="w-5 h-5" />
            </button>
            {!isVirtualActive && (
              <>
                <button 
                  onClick={() => setIsSaveModalOpen(true)}
                  className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors"
                  title="Salva"
                >
                  <Save className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsLoadModalOpen(true)}
                  className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors"
                  title="Carica"
                >
                  <FolderOpen className="w-5 h-5" />
                </button>
              </>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept=".json" 
            />
            <input 
              type="file" 
              ref={fileBlockInputRef} 
              onChange={handleBlockFileChange} 
              className="hidden" 
              accept=".json" 
            />
            {!isVirtualActive && (
              <>
                <div className="w-px h-6 bg-neutral-200 mx-1"></div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {isConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-emerald-500' : 'bg-neutral-300'}`}></span>
                  </span>
                  <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                </div>
                {!isConnected ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={connect}
                      disabled={!isSerialSupported}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-colors border-2 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="USB"
                    >
                      <Usb className="w-4 h-4" />
                    </button>
                    <button
                      onClick={connectBluetooth}
                      disabled={!isBluetoothSupported}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-colors border-2 bg-blue-500 hover:bg-blue-600 text-white border-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Bluetooth"
                    >
                      <Bluetooth className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={disconnect}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-colors border-2 bg-neutral-200 hover:bg-neutral-300 text-black border-black shadow-sm"
                  >
                    Disconnetti
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="w-full h-[calc(100vh-4rem)] flex flex-col p-0">
        {isVirtualActive && (
          <div className="flex-1 w-full h-full min-h-0 bg-neutral-700 flex">
            <VirtualEnvironment
              code={activeTab === 'blocks' ? blocklyCode : customCode}
              onClose={() => setIsVirtualActive(false)}
              language={language}
              motors={motors}
              sensors={sensors}
              wheelDiameter={wheelDiameter}
              wheelDistance={wheelDistance}
              maxMotorSpeed={maxMotorSpeed}
              isVirtualActive={isVirtualActive}
            />
          </div>
        )}

        <div className={`${isVirtualActive ? 'hidden' : 'grid'} grid-cols-1 ${showTerminal ? 'lg:grid-cols-12' : 'lg:grid-cols-1'} flex-1 min-h-0`}>
          
          {/* Left Column: Terminal */}
          {showTerminal && (
            <div className="lg:col-span-4 flex flex-col h-full min-h-0">
              <section className="bg-neutral-900 flex flex-col h-full overflow-hidden border-r border-neutral-800">
                <div className="bg-neutral-950 px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm font-medium text-neutral-300">Terminale Seriale</span>
                  </div>
                  <button 
                    onClick={() => setLogs('')}
                    className="text-xs text-neutral-500 hover:text-neutral-300 font-medium transition-colors"
                  >
                    Pulisci
                  </button>
                </div>
                <div 
                  ref={terminalRef}
                  className="flex-1 p-4 overflow-y-auto font-mono text-xs sm:text-sm text-neutral-300 whitespace-pre-wrap break-all"
                >
                  {logs || (
                    <span className="text-neutral-600 italic">
                      {isConnected ? "Nessun output registrato" : "In attesa di connessione..."}
                    </span>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Right Column: Editor (Blockly / Python) */}
          <div className={`${showTerminal ? 'lg:col-span-8' : 'lg:col-span-1'} flex flex-col h-full min-h-0`}>
            <section className="bg-white flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('blocks')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${activeTab === 'blocks' ? 'bg-neutral-200 shadow-sm border-black text-neutral-900' : 'bg-neutral-200 border-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-300'}`}
              >
                <Blocks className="w-4 h-4" />
                {language === 'en' ? 'Blocks' : 'Blocchi'}
              </button>
              <button
                onClick={() => setActiveTab('python')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${activeTab === 'python' ? 'bg-neutral-200 shadow-sm border-black text-neutral-900' : 'bg-neutral-200 border-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-300'}`}
              >
                <Code className="w-4 h-4" />
                Python
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-blue-50/70 border border-blue-300 rounded-lg p-1 mr-1 shadow-sm">
                <div className="flex items-center gap-1 px-1.5">
                  <span className="text-xs font-bold text-blue-800 uppercase tracking-wider whitespace-nowrap">Slot:</span>
                  <select 
                    value={currentSlot} 
                    onChange={(e) => handleSlotChange(parseInt(e.target.value))}
                    className="text-sm font-bold bg-white border border-blue-200 text-blue-950 rounded px-2 py-0.5 outline-none focus:border-blue-600 cursor-pointer shadow-sm"
                  >
                    {[...Array(TOTAL_SLOTS)].map((_, i) => (
                      <option key={i} value={i}>{language === 'en' ? 'Program' : 'Programma'} {i}</option>
                    ))}
                  </select>
                </div>
                <div className="w-px h-5 bg-blue-200 self-center"></div>
                <button
                  onClick={uploadMultiProgramMenu}
                  disabled={!isConnected || isExecuting}
                  className="flex items-center gap-1.5 bg-blue-800 hover:bg-blue-900 text-white disabled:bg-blue-100 disabled:text-blue-400 border border-blue-900/20 px-2.5 py-1 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
                  title={language === 'en' ? 'Load ALL codes as a menu selectable by the robot.' : 'Carica TUTTI i programmi come un menu selezionabile dal robot.'}
                >
                  <Blocks className="w-3.5 h-3.5" />
                  {language === 'en' ? 'Load all codes' : 'Carica tutti i codici'}
                </button>
              </div>
              <div className="w-px h-6 bg-neutral-300 mx-1"></div>
              <button
                onClick={() => executeCode(activeTab === 'blocks' ? blocklyCode : customCode, true)}
                disabled={!isConnected || isExecuting}
                className="flex items-center gap-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-900 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                title={language === 'en' ? 'Load code and wait. Press the LEFT or RIGHT button to start.' : 'Carica il codice e attendi. Premi il tasto SINISTRO o DESTRO per avviare.'}
              >
                <Upload className="w-4 h-4" />
                {language === 'en' ? 'Load code' : 'Carica Codice'}
              </button>
              <button
                onClick={() => executeCode(activeTab === 'blocks' ? blocklyCode : customCode, false)}
                disabled={!isConnected || isExecuting}
                className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-neutral-900 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                {language === 'en' ? 'Execute code' : 'Esegui codice'}
              </button>
              <button
                onClick={stopExecution}
                disabled={!isConnected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                title="Interrompi l'esecuzione"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop
              </button>
            </div>
          </div>
          
          <div className="flex-1 relative bg-neutral-50 overflow-hidden">
            <div className={`absolute inset-0 w-full h-full ${activeTab === 'blocks' ? 'block' : 'pointer-events-none opacity-0 invisible h-0 overflow-hidden'}`}>
              <BlocklyEditor 
                ref={blocklyEditorRef}
                motors={motors}
                sensors={sensors}
                wheelDiameter={wheelDiameter}
                wheelDistance={wheelDistance}
                maxMotorSpeed={maxMotorSpeed}
                isVisible={activeTab === 'blocks'}
                isVirtualActive={isVirtualActive}
                onToggleVirtual={() => setIsVirtualActive(!isVirtualActive)}
                onCodeChange={handleBlocklyCodeChange}
                language={language}
              />
            </div>
            <div className={`absolute inset-0 w-full h-full ${activeTab === 'python' ? 'block' : 'pointer-events-none opacity-0 invisible h-0 overflow-hidden'} bg-white overflow-y-auto`}>
              <Editor
                value={customCode}
                onValueChange={(code) => setCustomCode(code)}
                highlight={(code) => highlightWithBlockly(code)}
                padding={16}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 14,
                  minHeight: '100%',
                }}
                textareaClassName="focus:outline-none"
                className="w-full font-mono text-sm"
              />
            </div>
          </div>
        </section>
      </div>
      </div>
      </main>

      {/* Setup Modal */}
      {isSetupOpen && (
        <div className="fixed inset-0 bg-neutral-950/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-neutral-100 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col border-4 border-black relative z-[10000]">
            {/* Colorful Lego-style header */}
            <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 text-black px-6 py-4 flex items-center justify-between border-b-4 border-black">
              <div className="flex items-center gap-3">
                <Settings className="w-6 h-6 animate-pulse" />
                <h2 className="font-extrabold text-2xl tracking-tight uppercase">Setup Robot</h2>
              </div>
              <button 
                onClick={() => setIsSetupOpen(false)} 
                className="p-1.5 bg-white/40 hover:bg-white/80 active:scale-95 rounded-full text-black transition-all border-2 border-black"
                title="Chiudi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {(() => {
              const portConflicts = getPortConflicts(draftMotors, draftSensors);
              const hasConflicts = Object.keys(portConflicts).length > 0;

              return (
                <>
                  <div className="p-4 overflow-y-auto bg-neutral-50 flex-1">
                    {hasConflicts && (
                      <div className="mb-4 bg-red-100 border-2 border-red-500 rounded-2xl p-4 flex items-start gap-3 shadow-md animate-pulse">
                        <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1 text-xs">
                          <div className="font-extrabold text-red-800 text-sm mb-1 flex items-center gap-1.5">
                            <span>⛔ {language === 'en' ? 'Port conflicts detected!' : 'Conflitto di porte rilevato!'}</span>
                          </div>
                          <p className="text-red-700 font-semibold mb-2">
                            {language === 'en'
                              ? 'Configuration cannot be saved because the same port is assigned to multiple instances (motors or sensors). Each port (A-F) can host only one device:'
                              : 'Impossibile salvare la configurazione perché la stessa porta è assegnata a più istanze (motori o sensori). Ogni porta fisica (A-F) può ospitare un solo dispositivo:'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(portConflicts).map(([p, devs]) => (
                              <span key={p} className="inline-flex items-center gap-1.5 bg-red-200/90 text-red-950 px-2.5 py-1 rounded-lg font-bold font-mono border border-red-300">
                                <span className="bg-red-600 text-white rounded px-1.5 py-0.5 text-[10px]">Porta {p}</span>
                                <span>{devs.join(' + ')}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {/* Motori */}
                      <div className="flex flex-col">
                        <h3 className="font-extrabold text-base text-amber-800 mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 border-2 border-amber-300 w-fit shadow-sm">
                          ⚙️ {language === 'en' ? 'Motors' : 'Motori'}
                        </h3>
                        <div className="space-y-2 flex-1">
                          {draftMotors.map(motor => {
                            const isConflict = !!(motor.port && portConflicts[motor.port]);
                            return (
                              <div 
                                key={`motor-${motor.id}`} 
                                className={`p-2.5 bg-white rounded-xl border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                                  isConflict 
                                    ? 'border-red-500 bg-red-50/70 ring-2 ring-red-400' 
                                    : motor.port 
                                      ? 'border-amber-400 bg-amber-50/10' 
                                      : 'border-neutral-200'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className={`text-xs font-extrabold ${isConflict ? 'text-red-700' : motor.port ? 'text-amber-700' : 'text-neutral-500'}`}>
                                    {language === 'en' ? 'Motor' : 'Motore'} {motor.id}
                                  </span>
                                  <select 
                                    value={motor.port}
                                    onChange={(e) => handleDraftMotorChange(motor.id, 'port', e.target.value)}
                                    className={`text-xs font-bold border-2 rounded-md p-1 focus:outline-none cursor-pointer ${
                                      isConflict 
                                        ? 'border-red-500 bg-red-100 text-red-900 font-extrabold ring-1 ring-red-400' 
                                        : 'border-amber-300 bg-amber-50 focus:ring-1 focus:ring-amber-400'
                                    }`}
                                  >
                                    <option value="">{language === 'en' ? 'Port...' : 'Porta...'}</option>
                                    <option value="A">{language === 'en' ? 'Port A' : 'Porta A'}</option>
                                    <option value="B">{language === 'en' ? 'Port B' : 'Porta B'}</option>
                                    <option value="C">{language === 'en' ? 'Port C' : 'Porta C'}</option>
                                    <option value="D">{language === 'en' ? 'Port D' : 'Porta D'}</option>
                                    <option value="E">{language === 'en' ? 'Port E' : 'Porta E'}</option>
                                    <option value="F">{language === 'en' ? 'Port F' : 'Porta F'}</option>
                                  </select>
                                </div>
                                {isConflict && (
                                  <div className="text-[10px] font-bold text-red-600 mb-1.5 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                                    <span>
                                      {language === 'en' 
                                        ? `Duplicate port (also on ${portConflicts[motor.port].filter(d => !d.includes(`Motor ${motor.id}`) && !d.includes(`Motore ${motor.id}`)).join(', ')})`
                                        : `Porta duplicata (in uso su ${portConflicts[motor.port].filter(d => !d.includes(`Motor ${motor.id}`) && !d.includes(`Motore ${motor.id}`)).join(', ')})`}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-neutral-100">
                                  <label className={`flex items-center gap-1 text-[11px] font-extrabold px-1.5 py-0.5 rounded cursor-pointer transition-colors border ${motor.isTraction ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}>
                                    <input 
                                      type="checkbox" 
                                      checked={motor.isTraction}
                                      onChange={(e) => handleDraftMotorChange(motor.id, 'isTraction', e.target.checked)}
                                      className="rounded border-amber-300 text-amber-500 focus:ring-amber-500 w-3 h-3" 
                                    />
                                    {language === 'en' ? 'Drive' : 'Trazione'}
                                  </label>
                                  <label className={`flex items-center gap-1 text-[11px] font-extrabold px-1.5 py-0.5 rounded cursor-pointer transition-colors border ${motor.isInverted ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100'}`}>
                                    <input 
                                      type="checkbox" 
                                      checked={motor.isInverted}
                                      onChange={(e) => handleDraftMotorChange(motor.id, 'isInverted', e.target.checked)}
                                      className="rounded border-amber-300 text-amber-500 focus:ring-amber-500 w-3 h-3" 
                                    />
                                    {language === 'en' ? 'Invert' : 'Inverti'}
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sensori */}
                      <div className="flex flex-col">
                        <h3 className="font-extrabold text-base text-emerald-800 mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 border-2 border-emerald-300 w-fit shadow-sm">
                          👁️ {language === 'en' ? 'Sensors' : 'Sensori'}
                        </h3>
                        <div className="space-y-1.5 flex-1">
                          {draftSensors.map(sensor => {
                            const isConflict = !!(sensor.port && portConflicts[sensor.port]);
                            return (
                              <div 
                                key={`sensor-${sensor.id}`} 
                                className={`p-1.5 bg-white rounded-lg border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                                  isConflict 
                                    ? 'border-red-500 bg-red-50/70 ring-2 ring-red-400' 
                                    : sensor.port 
                                      ? 'border-emerald-400 bg-emerald-50/10' 
                                      : 'border-neutral-200'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[11px] font-extrabold ${isConflict ? 'text-red-700' : sensor.port ? 'text-emerald-700' : 'text-neutral-500'}`}>
                                    {language === 'en' ? 'Sensor' : 'Sensore'} {sensor.id}
                                  </span>
                                  <select 
                                    value={sensor.port}
                                    onChange={(e) => handleDraftSensorChange(sensor.id, 'port', e.target.value)}
                                    className={`text-[10px] font-bold border-2 rounded-md p-0.5 focus:outline-none cursor-pointer ${
                                      isConflict 
                                        ? 'border-red-500 bg-red-100 text-red-900 font-extrabold ring-1 ring-red-400' 
                                        : 'border-emerald-300 bg-emerald-50 focus:ring-1 focus:ring-emerald-400'
                                    }`}
                                  >
                                    <option value="">{language === 'en' ? 'Port...' : 'Porta...'}</option>
                                    <option value="A">{language === 'en' ? 'Port A' : 'Porta A'}</option>
                                    <option value="B">{language === 'en' ? 'Port B' : 'Porta B'}</option>
                                    <option value="C">{language === 'en' ? 'Port C' : 'Porta C'}</option>
                                    <option value="D">{language === 'en' ? 'Port D' : 'Porta D'}</option>
                                    <option value="E">{language === 'en' ? 'Port E' : 'Porta E'}</option>
                                    <option value="F">{language === 'en' ? 'Port F' : 'Porta F'}</option>
                                  </select>
                                </div>
                                {isConflict && (
                                  <div className="text-[10px] font-bold text-red-600 mb-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                                    <span>
                                      {language === 'en' 
                                        ? `Duplicate port (also on ${portConflicts[sensor.port].filter(d => !d.includes(`Sensor ${sensor.id}`) && !d.includes(`Sensore ${sensor.id}`)).join(', ')})`
                                        : `Porta duplicata (in uso su ${portConflicts[sensor.port].filter(d => !d.includes(`Sensor ${sensor.id}`) && !d.includes(`Sensore ${sensor.id}`)).join(', ')})`}
                                    </span>
                                  </div>
                                )}
                                <select 
                                  value={sensor.type}
                                  onChange={(e) => handleDraftSensorChange(sensor.id, 'type', e.target.value)}
                                  className={`w-full text-[10px] font-bold border-2 rounded-md p-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer ${sensor.type ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-neutral-200'}`}
                                >
                                  <option value="">{language === 'en' ? 'Sensor type...' : 'Tipo sensore...'}</option>
                                  <option value="color">{language === 'en' ? 'Color 🔴🔵' : 'Colore 🔴🔵'}</option>
                                  <option value="distance">{language === 'en' ? 'Distance (Ultrasonic) 📏' : 'Distanza (Ultrasuoni) 📏'}</option>
                                  <option value="force">{language === 'en' ? 'Touch/Force 🏋️' : 'Tocco/Forza 🏋️'}</option>
                                </select>
                                {sensor.type === 'color' && (
                                  <div className="mt-1 flex items-center justify-between bg-emerald-50/50 p-1 rounded-md border border-emerald-200/50">
                                    <span className="text-[9px] font-extrabold text-emerald-800 uppercase tracking-wider">
                                      {language === 'en' ? 'LOOKING:' : 'SGUARDO:'}
                                    </span>
                                    <select
                                      value={sensor.direction || 'down'}
                                      onChange={(e) => handleDraftSensorChange(sensor.id, 'direction', e.target.value)}
                                      className="text-[9px] font-extrabold border-2 border-emerald-300 rounded-md px-1 py-0 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer text-emerald-800"
                                    >
                                      <option value="down">{language === 'en' ? 'Down ⬇️' : 'In basso ⬇️'}</option>
                                      <option value="forward">{language === 'en' ? 'Forward ➡️' : 'In avanti ➡️'}</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Dimensioni Robot */}
                      <div className="flex flex-col">
                        <h3 className="font-extrabold text-base text-blue-800 mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-100 border-2 border-blue-300 w-fit shadow-sm">
                          📐 {language === 'en' ? 'Dimensions' : 'Dimensioni'}
                        </h3>
                        <div className="p-3 bg-white rounded-xl border-2 border-blue-300 shadow-sm space-y-3 flex-1">
                          <div className="space-y-1">
                            <label className="block text-xs font-extrabold text-blue-800">
                              {language === 'en' ? 'Wheel diameter (cm)' : 'Diametro ruota (cm)'}
                            </label>
                            <div className="relative rounded-md shadow-sm flex border-2 border-blue-300 overflow-hidden">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={draftWheelDiameter}
                                onChange={(e) => setDraftWheelDiameter(parseFloat(e.target.value) || 0)}
                                className="w-full text-xs font-bold p-1.5 bg-blue-50/30 focus:outline-none"
                                placeholder="es. 5.6"
                              />
                              <div className="bg-blue-100 border-l-2 border-blue-300 px-2 flex items-center justify-center">
                                <span className="text-blue-800 text-[10px] font-bold font-mono">cm</span>
                              </div>
                            </div>
                            <p className="text-[10px] font-medium leading-tight text-neutral-500">{language === 'en' ? 'Used to determine the driven distance.' : 'Usato per la distanza percorsa.'}</p>
                          </div>

                          <div className="space-y-1 pt-2 border-t border-dashed border-neutral-200">
                            <label className="block text-xs font-extrabold text-blue-800">
                              {language === 'en' ? 'Distance between wheels (cm)' : 'Distanza ruote (cm)'}
                            </label>
                            <div className="relative rounded-md shadow-sm flex border-2 border-blue-300 overflow-hidden">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={draftWheelDistance}
                                onChange={(e) => setDraftWheelDistance(parseFloat(e.target.value) || 0)}
                                className="w-full text-xs font-bold p-1.5 bg-blue-50/30 focus:outline-none"
                                placeholder="es. 11.5"
                              />
                              <div className="bg-blue-100 border-l-2 border-blue-300 px-2 flex items-center justify-center">
                                <span className="text-blue-800 text-[10px] font-bold font-mono">cm</span>
                              </div>
                            </div>
                            <p className="text-[10px] font-medium leading-tight text-neutral-500">{language === 'en' ? 'Used to calculate the curve radius.' : 'Distanza interasse per le curve.'}</p>
                          </div>
                        </div>

                        {/* Stato Batteria */}
                        <div className="flex flex-col mt-4">
                          <h3 className="font-extrabold text-base text-emerald-800 mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 border-2 border-emerald-300 w-fit shadow-sm">
                            🔋 {language === 'en' ? 'Robot Battery' : 'Batteria Robot'}
                          </h3>
                          <div className="p-3 bg-white rounded-xl border-2 border-emerald-300 shadow-sm space-y-3">
                            {!isConnected ? (
                              <div className="text-center py-4 text-neutral-500 text-xs italic">
                                {language === 'en' ? 'Connect the robot to view battery status' : 'Connetti il robot per vedere la batteria'}
                              </div>
                            ) : batteryState.percentage === null ? (
                              <div className="flex flex-col items-center justify-center py-4 gap-2">
                                <span className="text-xs text-neutral-500 italic animate-pulse">
                                  {language === 'en' ? 'Reading battery status...' : 'Lettura stato batteria...'}
                                </span>
                                <button
                                  onClick={queryBatteryFromRobot}
                                  className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-[10px] rounded border border-neutral-300 transition-all uppercase tracking-wider"
                                >
                                  {language === 'en' ? 'Read Now' : 'Leggi Ora'}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {/* Battery Level Visual */}
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-xs font-extrabold">
                                    <span className="text-neutral-600">
                                      {language === 'en' ? 'Charge level' : 'Livello carica'}
                                    </span>
                                    <span className={`text-sm ${
                                      batteryState.percentage > 50 ? 'text-emerald-600' :
                                      batteryState.percentage > 20 ? 'text-amber-600' : 'text-red-600'
                                    }`}>
                                      {batteryState.percentage}% {batteryState.current !== null && batteryState.current < 0 ? '⚡' : ''}
                                    </span>
                                  </div>
                                  <div className="w-full bg-neutral-100 rounded-full h-3.5 border-2 border-neutral-200 overflow-hidden p-0.5">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        batteryState.percentage > 50 ? 'bg-emerald-500' :
                                        batteryState.percentage > 20 ? 'bg-amber-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${batteryState.percentage}%` }}
                                    />
                                  </div>
                                </div>

                                {/* Telemetry Grid */}
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dashed border-neutral-100 text-[10px] font-mono text-neutral-600">
                                  <div className="bg-neutral-50 p-1.5 rounded border border-neutral-100">
                                    <div className="text-[9px] font-bold text-neutral-400 uppercase">Tensione</div>
                                    <div className="font-bold text-neutral-800">
                                      {batteryState.voltage ? (batteryState.voltage / 1000).toFixed(2) : '--'} V
                                    </div>
                                  </div>
                                  <div className="bg-neutral-50 p-1.5 rounded border border-neutral-100">
                                    <div className="text-[9px] font-bold text-neutral-400 uppercase">Corrente</div>
                                    <div className="font-bold text-neutral-800">
                                      {batteryState.current !== null ? `${batteryState.current} mA` : '--'}
                                    </div>
                                  </div>
                                  <div className="bg-neutral-50 p-1.5 rounded border border-neutral-100 col-span-2 flex justify-between items-center">
                                    <div>
                                      <span className="text-[9px] font-bold text-neutral-400 uppercase block">Temperatura</span>
                                      <span className="font-bold text-neutral-800">
                                        {batteryState.temperature ? (batteryState.temperature > 100 ? (batteryState.temperature / 10).toFixed(1) : batteryState.temperature.toFixed(1)) : '--'} °C
                                      </span>
                                    </div>
                                    <button
                                      onClick={queryBatteryFromRobot}
                                      className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded text-[9px] uppercase tracking-wider transition-all"
                                    >
                                      {language === 'en' ? 'Refresh' : 'Aggiorna'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Velocità massima motori */}
                      <div className="flex flex-col">
                        <h3 className="font-extrabold text-base text-rose-800 mb-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-100 border-2 border-rose-300 w-fit shadow-sm">
                          ⚡ {language === 'en' ? 'Speed' : 'Velocità'}
                        </h3>
                        <div className="p-3 bg-white rounded-xl border-2 border-rose-300 shadow-sm space-y-3 flex-1 flex flex-col justify-between">
                          <div className="space-y-2">
                            <label className="block text-xs font-extrabold text-rose-800">
                              {language === 'en' ? 'Maximum value (0-1000)' : 'Valore massimo (0-1000)'}
                            </label>
                            <div className="relative rounded-md shadow-sm border-2 border-rose-300 overflow-hidden">
                              <input
                                type="number"
                                min="0"
                                max="1000"
                                value={draftMaxMotorSpeed}
                                onChange={(e) => setDraftMaxMotorSpeed(parseInt(e.target.value) || 0)}
                                className="w-full text-center text-sm font-extrabold p-1.5 bg-rose-50/30 focus:outline-none text-rose-700"
                                placeholder="es. 100"
                              />
                            </div>
                            <div>
                              <input 
                                type="range"
                                min="0"
                                max="1000"
                                value={draftMaxMotorSpeed}
                                onChange={(e) => setDraftMaxMotorSpeed(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-rose-100 rounded-lg appearance-none cursor-pointer accent-rose-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-5 border-t-4 border-black bg-neutral-100 flex justify-between items-center gap-3">
                    <button 
                      onClick={handleDraftResetToDefault}
                      className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 active:scale-95 text-neutral-800 font-bold rounded-xl border-2 border-neutral-400 hover:border-black transition-all text-xs uppercase tracking-wider"
                      title={language === 'en' ? "Restore default factory configuration" : "Ripristina la configurazione predefinita di fabbrica"}
                    >
                      {language === 'en' ? 'Restore Default' : 'Ripristina Default'}
                    </button>
                    <div className="flex items-center gap-3">
                      {hasConflicts && (
                        <span className="text-xs font-bold text-red-600 flex items-center gap-1.5 bg-red-100 px-3 py-1.5 rounded-xl border border-red-300">
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          {language === 'en' ? 'Resolve port conflicts to save' : 'Risolvi i conflitti di porta prima di salvare'}
                        </span>
                      )}
                      <button 
                        onClick={handleSaveSetup} 
                        disabled={hasConflicts}
                        title={hasConflicts ? (language === 'en' ? 'Cannot save: port conflicts present' : 'Impossibile salvare: sono presenti porte duplicate') : undefined}
                        className={`px-6 py-3 font-extrabold rounded-2xl border-2 transition-all text-sm uppercase tracking-wider ${
                          hasConflicts
                            ? 'bg-neutral-300 text-neutral-500 border-neutral-400 cursor-not-allowed opacity-60 shadow-none'
                            : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 active:scale-95 text-black border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer'
                        }`}
                      >
                        {language === 'en' ? 'Save and Close' : 'Salva e Chiudi'}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modale Salva */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsSaveModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-neutral-800">Cosa vuoi salvare?</h2>
              <button 
                onClick={() => setIsSaveModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <button 
                onClick={() => {
                  handleSaveProgram();
                  setIsSaveModalOpen(false);
                }}
                className="w-full flex items-center gap-3 p-4 border border-neutral-200 rounded-xl hover:bg-yellow-50 hover:border-yellow-400 transition-colors text-left"
              >
                <div className="bg-yellow-100 p-2 rounded-lg text-yellow-600">
                  <Save className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-neutral-800">Salva Intero Programma</div>
                  <div className="text-xs text-neutral-500">Salva tutti i blocchi, il codice Python e la configurazione del robot.</div>
                </div>
              </button>
              <button 
                onClick={() => {
                  handleSaveBlock();
                  setIsSaveModalOpen(false);
                }}
                className="w-full flex items-center gap-3 p-4 border border-neutral-200 rounded-xl hover:bg-yellow-50 hover:border-yellow-400 transition-colors text-left"
              >
                <div className="bg-yellow-100 p-2 rounded-lg text-yellow-600">
                  <Blocks className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-neutral-800">Salva Blocco Selezionato</div>
                  <div className="text-xs text-neutral-500">Salva solo il blocco o gruppo di blocchi attualmente selezionato.</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale Carica */}
      {isLoadModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsLoadModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-neutral-800">Cosa vuoi caricare?</h2>
              <button 
                onClick={() => setIsLoadModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <button 
                onClick={() => {
                  handleLoadProgramClick();
                  setIsLoadModalOpen(false);
                }}
                className="w-full flex items-center gap-3 p-4 border border-neutral-200 rounded-xl hover:bg-yellow-50 hover:border-yellow-400 transition-colors text-left"
              >
                <div className="bg-yellow-100 p-2 rounded-lg text-yellow-600">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-neutral-800">Carica Programma</div>
                  <div className="text-xs text-neutral-500">Sostituisce il progetto attuale con uno salvato precedentemente.</div>
                </div>
              </button>
              <button 
                onClick={() => {
                  handleLoadBlockClick();
                  setIsLoadModalOpen(false);
                }}
                className="w-full flex items-center gap-3 p-4 border border-neutral-200 rounded-xl hover:bg-yellow-50 hover:border-yellow-400 transition-colors text-left"
              >
                <div className="bg-yellow-100 p-2 rounded-lg text-yellow-600">
                  <Blocks className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-neutral-800">Carica Blocco</div>
                  <div className="text-xs text-neutral-500">Aggiunge un blocco salvato al progetto attuale.</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
