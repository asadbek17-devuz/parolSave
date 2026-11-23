import { randomBytes, scrypt } from 'node:crypto'

export const KDF_PARAMS = {
  N: 131072,
  r: 8,
  p: 1,
  keylen: 32,
  maxmem: 256 * 1024 * 1024,
} as const

export function newSalt(): Buffer {
  return randomBytes(16)
}

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KDF_PARAMS.keylen, KDF_PARAMS, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
}
