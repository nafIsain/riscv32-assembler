// --- CONFIGURATION ---
const REGISTER_MAP = {
    "zero": 0, "ra": 1, "sp": 2, "gp": 3, "tp": 4, "t0": 5, "t1": 6, "t2": 7,
    "s0": 8, "fp": 8, "s1": 9, "a0": 10, "a1": 11, "a2": 12, "a3": 13, "a4": 14, "a5": 15,
    "a6": 16, "a7": 17, "s2": 18, "s3": 19, "s4": 20, "s5": 21, "s6": 22, "s7": 23,
    "s8": 24, "s9": 25, "s10": 26, "s11": 27, "t3": 28, "t4": 29, "t5": 30, "t6": 31
};

// --- MAIN LOGIC ---
document.getElementById('assembleBtn').addEventListener('click', assemble);

function assemble() {
    const input = document.getElementById('asmInput').value;
    const outputArea = document.getElementById('hexOutput');
    const logArea = document.getElementById('log');
    
    outputArea.value = '';
    logArea.innerHTML = '';

    const lines = input.split('\n');
    let machineCode = [];
    let symbolTable = {}; // Stores label -> address mapping
    let cleanedLines = []; // Stores { pc, tokens, originalLine }

    // --- PASS 1: Symbol Discovery & Cleaning ---
    let pc = 0; // Program Counter (in bytes)
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].split('#')[0].split('//')[0].trim();
        if (!line) continue;

        // Check for Label (ends with :)
        if (line.endsWith(':')) {
            let labelName = line.slice(0, -1); // Remove colon
            if (symbolTable[labelName] !== undefined) {
                logArea.innerHTML += `Error: Duplicate label '${labelName}' at line ${i+1}<br>`;
                return;
            }
            symbolTable[labelName] = pc;
            continue; // Labels don't advance PC themselves (unless code follows on same line, but let's enforce separate lines for simplicity)
        }

        // Tokenize
        let tokens = line.replace(/,/g, ' ').trim().split(/\s+/);
        cleanedLines.push({ pc: pc, tokens: tokens, lineNumber: i + 1 });
        pc += 4; // Each instruction is 4 bytes
    }

    // --- PASS 2: Code Generation ---
    for (let instr of cleanedLines) {
        try {
            let hex = processInstruction(instr.tokens, instr.pc, symbolTable);
            machineCode.push(hex);
        } catch (e) {
            logArea.innerHTML += `Line ${instr.lineNumber} Error: ${e.message}<br>`;
        }
    }

    outputArea.value = machineCode.join('\n');
}

function processInstruction(tokens, currentPC, symbolTable) {
    const opcodeName = tokens[0].toLowerCase();

    switch (opcodeName) {
        // R-Type
        case 'add': return encodeRType(tokens, 0x33, 0x0, 0x00);
        case 'sub': return encodeRType(tokens, 0x33, 0x0, 0x20);
        case 'xor': return encodeRType(tokens, 0x33, 0x4, 0x00);
        case 'or':  return encodeRType(tokens, 0x33, 0x6, 0x00);
        case 'and': return encodeRType(tokens, 0x33, 0x7, 0x00);
        case 'sll': return encodeRType(tokens, 0x33, 0x1, 0x00);
        case 'srl': return encodeRType(tokens, 0x33, 0x5, 0x00);
        case 'sra': return encodeRType(tokens, 0x33, 0x5, 0x20);
        case 'slt': return encodeRType(tokens, 0x33, 0x2, 0x00);
        case 'sltu': return encodeRType(tokens, 0x33, 0x3, 0x00);

        // I-Type (Arithmetic)
        case 'addi': return encodeIType(tokens, 0x13, 0x0);
        case 'xori': return encodeIType(tokens, 0x13, 0x4);
        case 'ori':  return encodeIType(tokens, 0x13, 0x6);
        case 'andi': return encodeIType(tokens, 0x13, 0x7);
        case 'slli': return encodeIType(tokens, 0x13, 0x1);
        case 'srli': return encodeIType(tokens, 0x13, 0x5);
        case 'srai': return encodeIType(tokens, 0x13, 0x5, 0x20);

        // I-Type (Loads)
        case 'lb':   return encodeIType(tokens, 0x03, 0x0);
        case 'lh':   return encodeIType(tokens, 0x03, 0x1);
        case 'lw':   return encodeIType(tokens, 0x03, 0x2);
        case 'lbu':  return encodeIType(tokens, 0x03, 0x4);
        case 'lhu':  return encodeIType(tokens, 0x03, 0x5);
        case 'jalr': return encodeIType(tokens, 0x67, 0x0);

        // S-Type (Stores) - Note: sw rs2, offset(rs1)
        case 'sb': return encodeSType(tokens, 0x23, 0x0);
        case 'sh': return encodeSType(tokens, 0x23, 0x1);
        case 'sw': return encodeSType(tokens, 0x23, 0x2);

        // B-Type (Branches)
        case 'beq': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x0);
        case 'bne': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x1);
        case 'blt': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x4);
        case 'bge': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x5);
        case 'bltu': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x6);
        case 'bgeu': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x7);

        // J-Type (Jumps)
        case 'jal': return encodeJType(tokens, currentPC, symbolTable, 0x6F);

        default:
            throw new Error(`Unknown instruction: ${opcodeName}`);
    }
}

// --- ENCODERS ---

function encodeRType(tokens, opcode, funct3, funct7) {
    if (tokens.length !== 4) throw new Error("R-Type requires 3 operands");
    const rd = parseRegister(tokens[1]);
    const rs1 = parseRegister(tokens[2]);
    const rs2 = parseRegister(tokens[3]);
    const inst = (funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode;
    return toHex(inst);
}

function encodeIType(tokens, opcode, funct3, specialFunct7 = 0) {
    let rd, rs1, imm;
    // Handle lw x1, 4(x2) syntax
    const loadMatch = tokens[2].match(/^(-?\d+|0x[0-9a-fA-F]+)\(([a-zA-Z0-9]+)\)$/);
    if (loadMatch) {
        rd = parseRegister(tokens[1]);
        imm = parseImmediate(loadMatch[1]);
        rs1 = parseRegister(loadMatch[2]);
    } else {
        rd = parseRegister(tokens[1]);
        rs1 = parseRegister(tokens[2]);
        imm = parseImmediate(tokens[3]);
    }
    
    if (specialFunct7 !== 0) imm = (imm & 0x1F) | (specialFunct7 << 5);
    
    const inst = ((imm & 0xFFF) << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode;
    return toHex(inst);
}

function encodeSType(tokens, opcode, funct3) {
    // Syntax: sw rs2, offset(rs1)  -> tokens: ["sw", "x1", "4(x2)"]
    if (tokens.length !== 3) throw new Error("S-Type requires 2 operands (rs2, offset(rs1))");
    
    const rs2 = parseRegister(tokens[1]); // Source is the first operand!
    
    const match = tokens[2].match(/^(-?\d+|0x[0-9a-fA-F]+)\(([a-zA-Z0-9]+)\)$/);
    if (!match) throw new Error("Invalid Store syntax. Use: sw rs2, offset(rs1)");
    
    const imm = parseImmediate(match[1]);
    const rs1 = parseRegister(match[2]);

    const imm11_5 = (imm >> 5) & 0x7F;
    const imm4_0 = imm & 0x1F;

    const inst = (imm11_5 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (imm4_0 << 7) | opcode;
    return toHex(inst);
}

function encodeBType(tokens, currentPC, symbolTable, opcode, funct3) {
    // Syntax: beq rs1, rs2, label
    if (tokens.length !== 4) throw new Error("B-Type requires 3 operands");
    
    const rs1 = parseRegister(tokens[1]);
    const rs2 = parseRegister(tokens[2]);
    const label = tokens[3];

    let targetPC = symbolTable[label];
    if (targetPC === undefined) {
        // Allow immediate offsets too (beq x1, x2, -4)
        try { targetPC = currentPC + parseImmediate(label); } 
        catch { throw new Error(`Undefined label: ${label}`); }
    }

    let offset = targetPC - currentPC;
    
    // RISC-V Branch offsets are multiples of 2. Bit 0 is ignored.
    if (offset % 2 !== 0) throw new Error("Branch offset must be multiple of 2");
    
    // Scramble Immediate: imm[12|10:5|4:1|11]
    let imm = offset >> 1; // Drop bit 0 immediately
    
    let imm12 = (offset >> 12) & 1;
    let imm11 = (offset >> 11) & 1;
    let imm10_5 = (offset >> 5) & 0x3F;
    let imm4_1 = (offset >> 1) & 0xF;

    const inst = (imm12 << 31) | (imm10_5 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (imm4_1 << 8) | (imm11 << 7) | opcode;
    return toHex(inst);
}

function encodeJType(tokens, currentPC, symbolTable, opcode) {
    // Syntax: jal rd, label  OR  jal label (pseudo for jal ra, label)
    let rd, label;
    
    if (tokens.length === 2) {
        rd = 1; // ra (x1)
        label = tokens[1];
    } else {
        rd = parseRegister(tokens[1]);
        label = tokens[2];
    }

    let targetPC = symbolTable[label];
    if (targetPC === undefined) {
         try { targetPC = currentPC + parseImmediate(label); } 
         catch { throw new Error(`Undefined label: ${label}`); }
    }

    let offset = targetPC - currentPC;
    
    // Scramble Immediate: imm[20|10:1|11|19:12]
    // Bit 0 is dropped
    
    let imm20 = (offset >> 20) & 1;
    let imm10_1 = (offset >> 1) & 0x3FF;
    let imm11 = (offset >> 11) & 1;
    let imm19_12 = (offset >> 12) & 0xFF;

    const inst = (imm20 << 31) | (imm19_12 << 12) | (imm11 << 20) | (imm10_1 << 21) | (rd << 7) | opcode;
    return toHex(inst);
}

// --- HELPERS (Keep these same as before) ---
function parseRegister(regStr) {
    if (!regStr) throw new Error("Missing register");
    regStr = regStr.toLowerCase();
    if (REGISTER_MAP.hasOwnProperty(regStr)) return REGISTER_MAP[regStr];
    if (regStr.startsWith('x')) return parseInt(regStr.substring(1));
    throw new Error(`Invalid register: ${regStr}`);
}

function parseImmediate(immStr) {
    if (!immStr) throw new Error("Missing immediate");
    return parseInt(immStr);
}

function toHex(value) {
    return (value >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
document.getElementById('downloadBtn').addEventListener('click', downloadHex);

function downloadHex() {
    const hexContent = document.getElementById('hexOutput').value;
    if (!hexContent) {
        alert("Assemble first!");
        return;
    }
    
    // Create a blob and trigger download
    const blob = new Blob([hexContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.hex'; // The filename for your FPGA project
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}