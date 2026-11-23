import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_WORDS = 256;
const CALL_WORDS = 64;
const MEMORY_WORDS = 256;
const OUTPUT_BYTES = 65_536;
const MAX_STEPS = 1_000_000;

// Each row covers the defined opcodes in one high nibble, starting at low nibble 0.
// Digits specify the required stack depth; a missing digit denotes an unknown opcode.
const required = ['00011223', '222222212221222', '222', '01100', '12', '1101'];

function binary(op: number, a: number, b: number): number {
  switch (op) {
    case 0x10: return a + b;
    case 0x11: return a - b;
    case 0x12: return Math.imul(a, b);
    case 0x13: return a / b;
    case 0x14: return a % b;
    case 0x15: return (a >>> 0) / (b >>> 0);
    case 0x16: return (a >>> 0) % (b >>> 0);
    case 0x18: return a & b;
    case 0x19: return a | b;
    case 0x1a: return a ^ b;
    case 0x1c: return a << b;
    case 0x1d: return a >> b;
    case 0x1e: return a >>> b;
    case 0x20: return Number(a === b);
    case 0x21: return Number(a < b);
    case 0x22: return Number((a >>> 0) < (b >>> 0));
    default: throw new Error(`Invalid binary opcode ${op}`);
  }
}

function execute(program: Buffer, input: Buffer) {
  const stack = new Int32Array(DATA_WORDS);
  const calls = new Uint16Array(CALL_WORDS);
  const memory = new Int32Array(MEMORY_WORDS);
  const output = Buffer.allocUnsafe(OUTPUT_BYTES);
  let pc = 0, sp = 0, cp = 0, read = 0, written = 0;
  const finish = (exit: number) => ({ exit, stdout: output.subarray(0, written) });

  for (let step = 0; step < MAX_STEPS; step++) {
    if (pc < 0 || pc >= program.length) return finish(9);
    const op = program[pc++];
    const needs = required[op >> 4]?.[op & 15];
    if (needs === undefined) return finish(5);
    const width = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (pc + width > program.length) return finish(9);
    const depth = Number(needs);
    if (sp < depth) return finish(2);
    if (sp === DATA_WORDS && (op === 1 || op === 2 || op === 4 || op === 6 || op === 0x52)) return finish(3);

    const top = stack[sp - 1];
    switch (op) {
      case 0x00: return finish(0);
      case 0x01: stack[sp++] = program.readInt8(pc++); break;
      case 0x02: stack[sp++] = program.readInt32LE(pc); pc += 4; break;
      case 0x03: sp--; break;
      case 0x04: stack[sp++] = top; break;
      case 0x05: stack[sp - 1] = stack[sp - 2]; stack[sp - 2] = top; break;
      case 0x06: stack[sp] = stack[sp - 2]; sp++; break;
      case 0x07: {
        const first = stack[sp - 3];
        stack[sp - 3] = stack[sp - 2];
        stack[sp - 2] = top;
        stack[sp - 1] = first;
        break;
      }
      case 0x17: stack[sp - 1] = -top; break;
      case 0x1b: stack[sp - 1] = ~top; break;
      case 0x30: case 0x31: case 0x32: {
        const offset = program.readInt16LE(pc);
        pc += 2;
        if (op !== 0x30) sp--;
        if (op === 0x30 || (op === 0x31 ? top === 0 : top !== 0)) pc += offset;
        break;
      }
      case 0x33: {
        if (cp === CALL_WORDS) return finish(7);
        calls[cp++] = pc + 2;
        pc = program.readUInt16LE(pc);
        break;
      }
      case 0x34:
        if (cp === 0) return finish(8);
        pc = calls[--cp];
        break;
      case 0x40: case 0x41:
        if (top < 0 || top >= MEMORY_WORDS) return finish(6);
        if (op === 0x40) stack[sp - 1] = memory[top];
        else { memory[top] = stack[sp - 2]; sp -= 2; }
        break;
      case 0x50: {
        const text = String(top);
        if (written + text.length > OUTPUT_BYTES) return finish(11);
        written += output.write(text, written, text.length, 'ascii');
        sp--;
        break;
      }
      case 0x51:
        if (written === OUTPUT_BYTES) return finish(11);
        output[written++] = top & 255;
        sp--;
        break;
      case 0x52: stack[sp++] = read < input.length ? input[read++] : -1; break;
      case 0x53: return finish(top & 255);
      default:
        if (op >= 0x13 && op <= 0x16 && top === 0) return finish(4);
        // Assignment to the signed word array truncates division and wraps results.
        sp--;
        stack[sp - 1] = binary(op, stack[sp - 1], top);
    }
  }
  return finish(10);
}

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const item of readdirSync(inputDir, { withFileTypes: true })) {
  if (!item.isDirectory()) continue;
  const source = join(inputDir, item.name);
  const dest = join(outputDir, item.name);
  const { exit, stdout } = execute(readFileSync(join(source, 'program.bin')), readFileSync(join(source, 'input.bin')));
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'stdout.bin'), stdout);
  writeFileSync(join(dest, 'exit.txt'), `${exit}\n`);
}
