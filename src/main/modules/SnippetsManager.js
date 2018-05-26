const { clipboard } = require('electron')
const ioHook = require('iohook')
const robot = require('robotjs')
const chars = require('./chars')
const keymap = require('native-keymap').getKeyMap()
const _ = require('lodash')

const KEY_BACKSPACE = 'Backspace'
const KEY_ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
const KEY_TAB = 'Tab'

class SnippetsManager {
    constructor(store) {
        this.store = store

        this.buffer = ''
        this.shouldMatch = true

        robot.setKeyboardDelay(0)

        ioHook.on('keydown', e => this._onKeyDown(e))
        ioHook.on('mouseclick', e => this._onMouseClick(e))

        ioHook.start()
    }

    destructor() {
        ioHook.unload()
        ioHook.stop()
    }

    _isBackspace(keycode) {
        return this._getCharNameFromKeycode(keycode) === KEY_BACKSPACE
    }

    _getCharNameFromKeycode(keycode) {
        return _.get(chars, keycode, null)
    }

    _eventToUnicode({ keycode, shiftKey, altKey, ctrlKey, metaKey }) {
        const name = this._getCharNameFromKeycode(keycode)

        if (!name || !(name in keymap)) {
            return false
        }

        let value

        if (shiftKey && altKey) {
            value = _.get(keymap, `${name}.withShiftAltGr`, false)
        } else if (shiftKey) {
            value = _.get(keymap, `${name}.withShift`, false)
        } else if (altKey) {
            value = _.get(keymap, `${name}.withAltGr`, false)
        } else if (!ctrlKey && !metaKey) {
            value = _.get(keymap, `${name}.value`, false)
        } else {
            value = false
        }

        if (!value) {
            return false
        }

        return value
    }

    _resetBuffer() {
        this.buffer = ''
    }

    _onMouseClick() {
        this._resetBuffer()
    }

    _shouldResetBuffer({ keycode, altKey }) {
        const pressed = this._getCharNameFromKeycode(keycode)

        return (pressed === KEY_BACKSPACE && altKey === true)
            || (pressed === KEY_TAB)
            || (KEY_ARROWS.includes(pressed))
    }

    _onKeyDown(e) {
        if (!this.shouldMatch) {
            return
        }

        if (this._shouldResetBuffer(e)) {
            this._resetBuffer()
            return
        }

        if (this._isBackspace(e.keycode)) {
            this._shortenBufferBy(1)
            return
        }

        const character = this._eventToUnicode(e)

        if (character) {
            this._addCharToBuffer(character)
            this._shortenBufferIfNecessary()
            this._replaceSnippetIfMatchFound()
        }

        console.log(this.buffer)
    }

    async _evaluate(matchedString, code) {
        return new Promise((resolve, reject) => {
            'use strict'

            const timeout = setTimeout(() => reject('Promise timed out after 5 minutes of inactivity'), 5000)

            let executable

            try {
                executable = eval(`
                    const fetch = require('node-fetch');
                    const exec = require('child_process').exec;
                    (${code})
                `)
            } catch (e) {
                reject('Syntax error in the snippet code')
            }

            if (!_.isFunction(executable)) {
                reject('Used snippet code is not a function')
            }

            const r = (data) => {
                clearTimeout(timeout)

                if (!_.isString(data)) {
                    data = JSON.stringify(data)
                }

                resolve(data)
            }

            const e = executable(matchedString)

            if (this._isPromise(e)) {
                e.then(r).catch(r)
            } else {
                r(e)
            }
        })
    }

    _isPromise(variable) {
        return _.isObject(variable) && _.isFunction(variable.then)
    }

    _replaceSnippetIfMatchFound() {
        for (const snippet of this.store.get('snippets')) {
            let key = snippet.key

            if (!snippet.regex) {
                // escape all regex-special characters
                key = key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
            }

            const match = new RegExp(`.*(${key})$`).exec(this.buffer)
            const matchedString = _.get(match, 1, false)

            if (matchedString) {
                for (let i = 0; i < matchedString.length; i++) {
                    robot.keyTap('backspace')
                }

                if (snippet.type === 'js') {
                    this._handleJavascriptSnippet(matchedString, snippet.value)
                } else {
                    this._handlePlainTextSnippet(snippet.value)
                }

                break
            }
        }
    }

    async _handleJavascriptSnippet(matchedString, code) {
        const clipboardContent = clipboard.readText()

        try {
            const data = await this._evaluate(matchedString, code)

            clipboard.writeText(data)
        } catch (error) {
            clipboard.writeText(error)
        } finally {
            setTimeout(() => robot.keyTap('v', 'command'), 50)
            setTimeout(() => clipboard.writeText(clipboardContent), 500)
        }
    }

    _handlePlainTextSnippet(value) {
        const clipboardContent = clipboard.readText()

        clipboard.writeText(value)

        setTimeout(() => robot.keyTap('v', 'command'), 50)
        setTimeout(() => clipboard.writeText(clipboardContent), 500)
    }

    _addCharToBuffer(character) {
        this.buffer += character
    }

    _shortenBufferBy(amount) {
        this.buffer = this.buffer.substring(0, this.buffer.length - amount)
    }

    _shortenBufferIfNecessary() {
        if (this.buffer.length > this.store.get('bufferLength')) {
            this.buffer = this.buffer.substring(1)
        }
    }
}

module.exports = SnippetsManager
