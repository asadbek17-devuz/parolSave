import { join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { Database } from '../db/pool'
import { registerIpc } from '../ipc/vault'
import { EntriesService } from '../services/entries'
import { VaultService } from '../services/vault'

const CSP = app.isPackaged
  ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"

let database: Database | undefined
let vault: VaultService | undefined
let mainWindow: BrowserWindow | null = null
let ready = false
let stopping = false

function installCsp(): void {
  const defaultSession = session.defaultSession
  if (!defaultSession) {
    return
  }
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' } as const))
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function shutdown(): Promise<void> {
  if (stopping) {
    return
  }
  stopping = true
  ready = false
  vault?.lock()
  try {
    await database?.stop()
  } catch (error) {
    console.error('Malumotlar bazasini toxtatishda xatolik:', error)
  }
  app.quit()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()
  installCsp()

  const userDataDir = app.getPath('userData')
  const db = new Database()
  database = db
  await db.start(userDataDir)

  const vaultService = new VaultService(db)
  vault = vaultService
  const entries = new EntriesService(db, vaultService)
  registerIpc({
    db,
    vault: vaultService,
    entries,
    userDataDir,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  })

  ready = true
  createWindow()
}

app.on('before-quit', (event) => {
  if (stopping) {
    return
  }
  event.preventDefault()
  void shutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void shutdown()
  }
})

app.on('activate', () => {
  if (ready && !stopping && BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

void bootstrap().catch((error: unknown) => {
  console.error('Ilovani ishga tushirishda xatolik:', error)
  void shutdown()
})
