let __stop_flag = 0;
let _is_running_user_code = 0;
let _WAIT_FIRST_TIME = 0;
let _LEFT_PORT = 0;
let _RIGHT_PORT = 0;
let _LEFT_INVERTED = 0;
let _RIGHT_INVERTED = 0;
// import motor
// import motor_pair
// import color_sensor
// import distance_sensor
// import force_sensor
// from hub import port, light_matrix, sound, motion_sensor, button
try {
    // from hub import status_light
}
catch (e) {
    status_light = None
}
// import utime
// import runloop
// import sys
__stop_flag = false
_is_running_user_code = false
_WAIT_FIRST_TIME = false
_LEFT_PORT = port.A
_RIGHT_PORT = port.B
_LEFT_INVERTED = false
_RIGHT_INVERTED = false
function _drive_pair(steering, velocity) {
    if (! _LEFT_INVERTED && ! _RIGHT_INVERTED) {
        motor_pair.move(motor_pair.PAIR_1, steering, velocity = velocity)
        return
    }
    if (_LEFT_INVERTED && _RIGHT_INVERTED) {
        motor_pair.move(motor_pair.PAIR_1, -steering, velocity = -velocity)
        return
    }
    left_vel = velocity
    right_vel = velocity
    if (steering > 0) {
        right_vel = int(velocity * (50 - steering) / 50)
    }
    else if (steering < 0) {
        left_vel = int(velocity * (50 + steering) / 50)
    }
    if (_LEFT_INVERTED) {
        left_vel = -left_vel
    }
    if (_RIGHT_INVERTED) {
        right_vel = -right_vel
    }
    try { motor.run(_LEFT_PORT, left_vel) }
    catch (e) {  }
    try { motor.run(_RIGHT_PORT, right_vel) }
    catch (e) {  }
}
async function _drive_pair_for_degrees(degrees, steering, velocity) {
    if (globals().get('__stop_flag', false)) {
        throw new Error(String(Exception("Programma Interrotto")));
    }
    if (! _LEFT_INVERTED && ! _RIGHT_INVERTED) {
        await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, steering, velocity = velocity)
        if (globals().get('__stop_flag', false)) {
            throw new Error(String(Exception("Programma Interrotto")));
        }
        return
    }
    if (_LEFT_INVERTED && _RIGHT_INVERTED) {
        await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees, -steering, velocity = -velocity)
        if (globals().get('__stop_flag', false)) {
            throw new Error(String(Exception("Programma Interrotto")));
        }
        return
    }
    left_vel = velocity
    right_vel = velocity
    if (steering > 0) {
        right_vel = int(velocity * (50 - steering) / 50)
    }
    else if (steering < 0) {
        left_vel = int(velocity * (50 + steering) / 50)
    }
    if (_LEFT_INVERTED) {
        left_vel = -left_vel
    }
    if (_RIGHT_INVERTED) {
        right_vel = -right_vel
    }
    try { motor.reset_relative_position(_LEFT_PORT, 0) }
    catch (e) {  }
    try { motor.reset_relative_position(_RIGHT_PORT, 0) }
    catch (e) {  }
    try { motor.run(_LEFT_PORT, left_vel) }
    catch (e) {  }
    try { motor.run(_RIGHT_PORT, right_vel) }
    catch (e) {  }
    target = abs(degrees)
    try {
        while (true) {
            if (globals().get('__stop_flag', false)) {
                break
            }
            pos_left = 0
            pos_right = 0
            try { pos_left = abs(motor.relative_position(_LEFT_PORT)) }
            catch (e) {  }
            try { pos_right = abs(motor.relative_position(_RIGHT_PORT)) }
            catch (e) {  }
            if (pos_left >= target || pos_right >= target) {
                break
            }
            await sleep(10)
        }
    }
    finally {
        try { motor.stop(_LEFT_PORT) }
        catch (e) {  }
        try { motor.stop(_RIGHT_PORT) }
        catch (e) {  }
    }
    if (globals().get('__stop_flag', false)) {
        throw new Error(String(Exception("Programma Interrotto")));
    }
}
function _stop_pair() {
    try { motor_pair.stop(motor_pair.PAIR_1) }
    catch (e) {  }
    try { motor.stop(_LEFT_PORT) }
    catch (e) {  }
    try { motor.stop(_RIGHT_PORT) }
    catch (e) {  }
}
function _safe_sensor(func, port_val, def_val=-1) {
    try {
        return func(port_val)
    }
    catch (e) {
        return def_val
    }
}
async function custom_sleep(ms) {
    if (globals().get('__stop_flag', false)) {
        throw new Error(String(Exception("Programma Interrotto")));
    }
    await sleep(ms)
}
async function _monitor_stop_button() {
    // from hub import button, port
    // import runloop
    // import sys
    try {
        await sleep(400)
        while (true) {
            pressed = false
            if (hasattr(button, 'CENTER') && button.pressed(button.CENTER)) {
                pressed = true
            }
            if (hasattr(button, 'POWER') && button.pressed(button.POWER)) {
                pressed = true
            }
            try {
                if (hasattr(button, 'center') && button.center.is_pressed()) {
                    pressed = true
                }
            }
            catch (e) {
                // pass
            }
            if (hasattr(button, 'center') && button.pressed(button.center)) {
                pressed = true
            }
            if (hasattr(button, 'power') && button.pressed(button.power)) {
                pressed = true
            }
            if (pressed && globals().get('_is_running_user_code', false)) {
                // global __stop_flag
                __stop_flag = true
                try {
                    // import motor_pair
                    motor_pair.stop(motor_pair.PAIR_1)
                }
                catch (e) {
                    // pass
                }
                try {
                    // import motor
                    for (let p of ['A', 'B', 'C', 'D', 'E', 'F']) {
                        try { motor.stop(getattr(port, p)) }
                        catch (e) {  }
                    }
                }
                catch (e) {
                    // pass
                }
            }
            await sleep(50)
        }
    }
    catch (e) {
        // pass
    }
}
try {
    motor_pair.unpair(motor_pair.PAIR_1)
}
catch (e) {
    // pass
}
try {
    motor_pair.pair(motor_pair.PAIR_1, port.${config.leftPort}, port.${config.rightPort})
}
catch (e) {
    // pass
}
async function _run_user_code() {
    // pass
}
async function main() {
    // global __stop_flag
    // global _is_running_user_code
    // from hub import button, light_matrix
    try {
        // from hub import status_light
    }
    catch (e) {
        status_light = None
    }
    // import runloop
    // import sys
    try {
        clearLightMatrix()
    }
    catch (e) {
        // pass
    }
    try {
        if (hasattr(runloop, 'create_task')) {
            runloop.create_task(_monitor_stop_button())
        }
        else {
            // import asyncio
            asyncio.create_task(_monitor_stop_button())
        }
    }
    catch (e) {
        print("Errore monitor stop:", e)
    }
    is_wait_mode = globals().get('_WAIT_FIRST_TIME', false)
    first_run = true
    while (true) {
        if ((first_run && is_wait_mode) || ! first_run) {
            if (first_run && is_wait_mode) {
                if (status_light) {
                    try {
                        status_light.on('red')
                    }
                    catch (e) {
                        // pass
                    }
                }
                try {
                    writeLightMatrix("C")
                }
                catch (e) {
                    try {
                        light_matrix.show("C")
                    }
                    catch (e) {
                        // pass
                    }
                }
                try {
                    playNote(1000, 100, 100)
                }
                catch (e) {
                    try {
                        beep()
                    }
                    catch (e) {
                        // pass
                    }
                }
                await sleep(200)
                try {
                    playNote(1000, 100, 100)
                }
                catch (e) {
                    try {
                        beep()
                    }
                    catch (e) {
                        // pass
                    }
                }
            }
            else if (! first_run) {
                try {
                    clearLightMatrix()
                }
                catch (e) {
                    // pass
                }
                if (status_light) {
                    try {
                        status_light.on('white')
                    }
                    catch (e) {
                        // pass
                    }
                }
            }
            while (true) {
                start_pressed = false
                if (hasattr(button, 'LEFT') && button.pressed(button.LEFT)) {
                    start_pressed = true
                }
                if (hasattr(button, 'RIGHT') && button.pressed(button.RIGHT)) {
                    start_pressed = true
                }
                if (hasattr(button, 'CENTER') && button.pressed(button.CENTER)) {
                    start_pressed = true
                }
                if (hasattr(button, 'POWER') && button.pressed(button.POWER)) {
                    start_pressed = true
                }
                try {
                    if (hasattr(button, 'left') && button.left.is_pressed()) {
                        start_pressed = true
                    }
                    if (hasattr(button, 'right') && button.right.is_pressed()) {
                        start_pressed = true
                    }
                    if (hasattr(button, 'center') && button.center.is_pressed()) {
                        start_pressed = true
                    }
                }
                catch (e) {
                    // pass
                }
                if (hasattr(button, 'center') && button.pressed(button.center)) {
                    start_pressed = true
                }
                if (hasattr(button, 'power') && button.pressed(button.power)) {
                    start_pressed = true
                }
                if (start_pressed) {
                    break
                }
                await sleep(50)
            }
            for (let _ = 0; _ < 50; _++) {
                still_pressed = false
                if (hasattr(button, 'LEFT') && button.pressed(button.LEFT)) {
                    still_pressed = true
                }
                if (hasattr(button, 'RIGHT') && button.pressed(button.RIGHT)) {
                    still_pressed = true
                }
                if (hasattr(button, 'CENTER') && button.pressed(button.CENTER)) {
                    still_pressed = true
                }
                try {
                    if (hasattr(button, 'left') && button.left.is_pressed()) {
                        still_pressed = true
                    }
                    if (hasattr(button, 'right') && button.right.is_pressed()) {
                        still_pressed = true
                    }
                    if (hasattr(button, 'center') && button.center.is_pressed()) {
                        still_pressed = true
                    }
                }
                catch (e) {
                    // pass
                }
                if (hasattr(button, 'center') && button.pressed(button.center)) {
                    still_pressed = true
                }
                if (! still_pressed) {
                    break
                }
                await sleep(20)
            }
            try {
                clearLightMatrix()
            }
            catch (e) {
                // pass
            }
            if (status_light) {
                try {
                    status_light.on('white')
                }
                catch (e) {
                    // pass
                }
            }
            await sleep(100)
        }
        __stop_flag = false
        _is_running_user_code = true
        try {
            await _run_user_code()
        }
        catch (e) {
            print("Interruzione o errore:", e)
        }
        if (is_wait_mode || ! first_run) {
            try {
                clearLightMatrix()
            }
            catch (e) {
                // pass
            }
            await sleep(50)
        }
        _is_running_user_code = false
        stopPair()
        if (! is_wait_mode) {
            break
        }
        first_run = false
        await sleep(500)
    }
}
runloop.run(main())
