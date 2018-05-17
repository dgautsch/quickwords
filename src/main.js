const config = require('../config')
config.load()

const { app, Tray } = require('electron')
const path = require('path')
const menu = require('./modules/menu')
const aboutWindow = require('./windows/about')
const preferencesWindow = require('./windows/preferences')
const iconPath = path.join(__dirname, '../assets/iconTemplate.png')
const { doNotQuitAppOnWindowClosure, unregisterWindowListeners, checkForNewVersion, registerNativeShortcuts } = require('./helpers')
const SnippetsManager = require('./modules/SnippetsManager')
const PreferencesManager = require('./modules/PreferencesManager')

let appIcon
const snippetsManager = new SnippetsManager()
const windows = {}

if (process.env.ENVIRONMENT === 'development') {
    require('electron-reload')([
        path.join(__dirname),
    ], {
        electron: require(path.join(__dirname, '../node_modules/electron')),
        ignored: /.*\.sass/,
    })
}

app.dock.hide()

app.on('ready', () => {
    const preferencesManager = new PreferencesManager()
    const isFirstLaunch = preferencesManager.init()

    if (isFirstLaunch) {
        app.relaunch()
        return app.exit(0)
    }

    windows.about = aboutWindow.init()
    windows.preferences = preferencesWindow.init()

    windows.about.snippetsManager = snippetsManager
    windows.preferences.snippetsManager = snippetsManager
    windows.preferences.preferencesManager = preferencesManager

    windows.preferences.on('focus', () => {
        snippetsManager.shouldMatch = false
    })
    windows.preferences.on('blur', () => {
        snippetsManager.shouldMatch = true
    })

    doNotQuitAppOnWindowClosure(windows)

    appIcon = new Tray(iconPath)

    appIcon.setToolTip('Quickwords')
    appIcon.setContextMenu(menu)

    setTimeout(checkForNewVersion, 1000)

    if (process.env.ENVIRONMENT === 'production') {
        registerNativeShortcuts(app, windows)
    }
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
    unregisterWindowListeners(windows)
    snippetsManager.destructor()
})
