import * as crypto from 'crypto'

import wordlist from './wordlist.en'

export type Pbkdf2SyncFunction = (
  password: string | Buffer,
  salt: string | Buffer,
  iterations: number,
  keylen: number,
  digest: string
) => Buffer

export type Pbkdf2Function = (
  password: string | Buffer,
  salt: string | Buffer,
  iterations: number,
  keylen: number,
  digest: string,
  callback: (err: Error | null, derivedKey: Buffer | null) => void
) => void

export class Mnemonic {
  static pbkdf2Sync: Pbkdf2SyncFunction = crypto.pbkdf2Sync
  static pbkdf2: Pbkdf2Function = crypto.pbkdf2

  private _entropy: Buffer
  private _words: string[]
  private _phrase: string

  private constructor (entropy: Buffer, words: string[]) {
    this._entropy = entropy
    this._words = words
  }

  static generate (entropy: Buffer): Mnemonic | null {
    if (entropy.length % 4 !== 0) {
      return null
    }

    const ent = entropy.length * 8
    const cs = ent / 32

    const bits = flatten(Array.from(entropy).map(uint8ToBitArray))
    const shasum = crypto.createHash('sha256').update(entropy).digest()
    const checksum = flatten(Array.from(shasum).map(uint8ToBitArray)).slice(
      0,
      cs
    )
    bits.push(...checksum)

    const words: string[] = []
    for (let i = 0; i < bits.length / 11; i++) {
      const idx = elevenBitsToInt(bits.slice(i * 11, (i + 1) * 11))
      words.push(wordlist[idx])
    }

    return new Mnemonic(entropy, words)
  }

  static parse (phrase: string): Mnemonic | null {
    const words = phrase.normalize('NFKD').split(' ')
    if (words.length % 3 !== 0) return null

    const bitArrays: number[][] = []
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const idx = wordlist.indexOf(word)
      if (idx === -1) return null
      bitArrays.push(uint11ToBitArray(idx))
    }

    const bits = flatten(bitArrays)
    const cs = bits.length / 33
    if (cs !== Math.floor(cs)) return null
    const checksum = bits.slice(-cs)
    bits.splice(-cs, cs)

    const entropy: number[] = []
    for (let i = 0; i < bits.length / 8; i++) {
      entropy.push(eightBitsToInt(bits.slice(i * 8, (i + 1) * 8)))
    }
    const entropyBuf = Buffer.from(entropy)
    const shasum = crypto.createHash('sha256').update(entropyBuf).digest()
    const checksumFromSha = flatten(
      Array.from(shasum).map(uint8ToBitArray)
    ).slice(0, cs)

    if (!arraysEqual(checksumFromSha, checksum)) return null

    return new Mnemonic(entropyBuf, words)
  }

  get entropy (): Buffer {
    return this._entropy
  }

  get words (): string[] {
    return this._words
  }

  get phrase (): string {
    if (!this._phrase) {
      this._phrase = this._words.join(' ')
    }
    return this._phrase
  }

  toSeed (passphrase: string = ''): Buffer {
    const salt = `mnemonic${passphrase}`
    return Mnemonic.pbkdf2Sync(
      this.phrase.normalize('NFKD'),
      salt.normalize('NFKD'),
      2048,
      64,
      'sha512'
    )
  }

  toSeedAsync (passphrase: string = ''): Promise<Buffer> {
    const salt = `mnemonic${passphrase}`
    return new Promise<Buffer>((resolve, reject) => {
      Mnemonic.pbkdf2(
        this.phrase.normalize('NFKD'),
        salt.normalize('NFKD'),
        2048,
        64,
        'sha512',
        (err, key) => {
          if (err) {
            reject(err)
            return
          }
          resolve(key!)
        }
      )
    })
  }
}

function flatten<T> (input: T[][]): T[] {
  const arr: T[] = []
  return arr.concat(...input)
}

function uint11ToBitArray (n: number): number[] {
  return [
    Math.min(n & 1024, 1),
    Math.min(n & 512, 1),
    Math.min(n & 256, 1),
    Math.min(n & 128, 1),
    Math.min(n & 64, 1),
    Math.min(n & 32, 1),
    Math.min(n & 16, 1),
    Math.min(n & 8, 1),
    Math.min(n & 4, 1),
    Math.min(n & 2, 1),
    Math.min(n & 1, 1)
  ]
}

function uint8ToBitArray (n: number): number[] {
  return [
    Math.min(n & 128, 1),
    Math.min(n & 64, 1),
    Math.min(n & 32, 1),
    Math.min(n & 16, 1),
    Math.min(n & 8, 1),
    Math.min(n & 4, 1),
    Math.min(n & 2, 1),
    Math.min(n & 1, 1)
  ]
}

function elevenBitsToInt (bits: number[]): number {
  return (
    bits[0] * 1024 +
    bits[1] * 512 +
    bits[2] * 256 +
    bits[3] * 128 +
    bits[4] * 64 +
    bits[5] * 32 +
    bits[6] * 16 +
    bits[7] * 8 +
    bits[8] * 4 +
    bits[9] * 2 +
    bits[10]
  )
}

function eightBitsToInt (bits: number[]): number {
  return (
    bits[0] * 128 +
    bits[1] * 64 +
    bits[2] * 32 +
    bits[3] * 16 +
    bits[4] * 8 +
    bits[5] * 4 +
    bits[6] * 2 +
    bits[7]
  )
}

function arraysEqual (a: Array<any>, b: Array<any>): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
