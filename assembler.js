// --- CONFIGURATION ---
const REGISTER_MAP = {
    "zero": 0, "ra": 1, "sp": 2, "gp": 3, "tp": 4, "t0": 5, "t1": 6, "t2": 7,
    "s0": 8, "fp": 8, "s1": 9, "a0": 10, "a1": 11, "a2": 12, "a3": 13, "a4": 14, "a5": 15,
    "a6": 16, "a7": 17, "s2": 18, "s3": 19, "s4": 20, "s5": 21, "s6": 22, "s7": 23,
    "s8": 24, "s9": 25, "s10": 26, "s11": 27, "t3": 28, "t4": 29, "t5": 30, "t6": 31
};

// --- EVENTS ---
document.getElementById('assembleBtn').addEventListener('click', assemble);
document.getElementById('downloadHexBtn').addEventListener('click', () => downloadFile('hex'));
document.getElementById('downloadMifBtn').addEventListener('click', () => downloadFile('mif'));

// --- MAIN LOGIC ---
function assemble() {
    const input = document.getElementById('asmInput').value;
    const outputArea = document.getElementById('hexOutput');
    const logArea = document.getElementById('log');
    const debugMode = document.getElementById('debugMode').checked;
    
    outputArea.value = '';
    logArea.innerHTML = '';

    const lines = input.split('\n');
    let machineCode = [];
    let symbolTable = {}; 
    let cleanedLines = []; 

    // --- PASS 1: Symbol Discovery ---
    let pc = 0;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].split('#')[0].split('//')[0].trim();
        if (!line) continue;

        if (line.endsWith(':')) {
            let labelName = line.slice(0, -1);
            if (symbolTable[labelName] !== undefined) {
                logArea.innerHTML += `Error: Duplicate label '${labelName}'<br>`;
                return;
            }
            symbolTable[labelName] = pc;
            continue; 
        }

        let tokens = line.replace(/,/g, ' ').trim().split(/\s+/);
        cleanedLines.push({ pc: pc, tokens: tokens, lineNumber: i + 1 });
        
        pc += 4;
        
        // If Debug Mode is on, we are effectively inserting 3 NOPs after this instruction
        if (debugMode) {
            pc += 12; // 3 * 4 bytes
        }
    }

    // --- PASS 2: Code Generation ---
    for (let instr of cleanedLines) {
        try {
            let hex = processInstruction(instr.tokens, instr.pc, symbolTable);
            machineCode.push(hex);
            
            // Insert NOPs if Debug Mode is on
            // NOP = addi x0, x0, 0 = 0x00000013
            if (debugMode) {
                machineCode.push("00000013");
                machineCode.push("00000013");
                machineCode.push("00000013");
            }

        } catch (e) {
            logArea.innerHTML += `Line ${instr.lineNumber} Error: ${e.message}<br>`;
        }
    }

    // Store raw output for downloads
    outputArea.value = machineCode.join('\n');
}

function processInstruction(tokens, currentPC, symbolTable) {
    const opcodeName = tokens[0].toLowerCase();

    switch (opcodeName) {
        // Pseudo-Instructions
        case 'nop': return "00000013"; // addi x0, x0, 0

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

        // I-Type
        case 'addi': return encodeIType(tokens, 0x13, 0x0);
        case 'xori': return encodeIType(tokens, 0x13, 0x4);
        case 'ori':  return encodeIType(tokens, 0x13, 0x6);
        case 'andi': return encodeIType(tokens, 0x13, 0x7);
        case 'slli': return encodeIType(tokens, 0x13, 0x1);
        case 'srli': return encodeIType(tokens, 0x13, 0x5);
        case 'srai': return encodeIType(tokens, 0x13, 0x5, 0x20);
        case 'lb':   return encodeIType(tokens, 0x03, 0x0);
        case 'lh':   return encodeIType(tokens, 0x03, 0x1);
        case 'lw':   return encodeIType(tokens, 0x03, 0x2);
        case 'lbu':  return encodeIType(tokens, 0x03, 0x4);
        case 'lhu':  return encodeIType(tokens, 0x03, 0x5);
        case 'jalr': return encodeIType(tokens, 0x67, 0x0);

        // S-Type
        case 'sb': return encodeSType(tokens, 0x23, 0x0);
        case 'sh': return encodeSType(tokens, 0x23, 0x1);
        case 'sw': return encodeSType(tokens, 0x23, 0x2);

        // B-Type
        case 'beq': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x0);
        case 'bne': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x1);
        case 'blt': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x4);
        case 'bge': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x5);
        case 'bltu': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x6);
        case 'bgeu': return encodeBType(tokens, currentPC, symbolTable, 0x63, 0x7);

        // J-Type
        case 'jal': return encodeJType(tokens, currentPC, symbolTable, 0x6F);

        default: throw new Error(`Unknown instruction: ${opcodeName}`);
    }
}

// --- FILE EXPORT LOGIC ---
function downloadFile(type) {
    const rawHex = document.getElementById('hexOutput').value;
    if (!rawHex) { alert("Assemble first!"); return; }

    let content = "";
    let filename = "";

    if (type === 'hex') {
        content = rawHex;
        filename = "program.hex";
    } 
    else if (type === 'mif') {
        // Construct MIF Header
        const lines = rawHex.split('\n');
        content += `DEPTH = 256;\nWIDTH = 32;\nADDRESS_RADIX = HEX;\nDATA_RADIX = HEX;\nCONTENT\nBEGIN\n`;
        
        lines.forEach((line, index) => {
            if(line.trim() === "") return;
            // Format: Address : Data;
            let addr = index.toString(16).toUpperCase();
            content += `${addr} : ${line};\n`;
        });
        
        content += `END;\n`;
        filename = "program.mif";
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- ENCODING HELPERS (Standard RV32I) ---
function encodeRType(tokens, opcode, funct3, funct7) {
    const rd = parseRegister(tokens[1]);
    const rs1 = parseRegister(tokens[2]);
    const rs2 = parseRegister(tokens[3]);
    return toHex((funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode);
}

function encodeIType(tokens, opcode, funct3, specialFunct7 = 0) {
    let rd, rs1, imm;
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
    return toHex(((imm & 0xFFF) << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode);
}

function encodeSType(tokens, opcode, funct3) {
    const rs2 = parseRegister(tokens[1]);
    const match = tokens[2].match(/^(-?\d+|0x[0-9a-fA-F]+)\(([a-zA-Z0-9]+)\)$/);
    if (!match) throw new Error("Invalid Store syntax");
    const imm = parseImmediate(match[1]);
    const rs1 = parseRegister(match[2]);
    const imm11_5 = (imm >> 5) & 0x7F;
    const imm4_0 = imm & 0x1F;
    return toHex((imm11_5 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (imm4_0 << 7) | opcode);
}

function encodeBType(tokens, currentPC, symbolTable, opcode, funct3) {
    const rs1 = parseRegister(tokens[1]);
    const rs2 = parseRegister(tokens[2]);
    const label = tokens[3];
    let targetPC = symbolTable[label];
    if (targetPC === undefined) {
        try { targetPC = currentPC + parseImmediate(label); } 
        catch { throw new Error(`Undefined label: ${label}`); }
    }
    // Correction: In Debug Mode, PC increments by 16 (4 instr) not 4. 
    // But relative offsets should effectively ignore the NOPs? 
    // Actually, usually you want branches to jump over the NOPs too. 
    // This simple logic calculates jump based on memory address. 
    // Since we incremented PC by 12 in Pass 1, the targetPC is correct.
    let offset = targetPC - currentPC;
    let imm = offset >> 1;
    let imm12 = (offset >> 12) & 1;
    let imm11 = (offset >> 11) & 1;
    let imm10_5 = (offset >> 5) & 0x3F;
    let imm4_1 = (offset >> 1) & 0xF;
    return toHex((imm12 << 31) | (imm10_5 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (imm4_1 << 8) | (imm11 << 7) | opcode);
}

function encodeJType(tokens, currentPC, symbolTable, opcode) {
    let rd = (tokens.length === 2) ? 1 : parseRegister(tokens[1]);
    let label = (tokens.length === 2) ? tokens[1] : tokens[2];
    let targetPC = symbolTable[label];
    if (targetPC === undefined) {
         try { targetPC = currentPC + parseImmediate(label); } 
         catch { throw new Error(`Undefined label: ${label}`); }
    }
    let offset = targetPC - currentPC;
    let imm20 = (offset >> 20) & 1;
    let imm10_1 = (offset >> 1) & 0x3FF;
    let imm11 = (offset >> 11) & 1;
    let imm19_12 = (offset >> 12) & 0xFF;
    return toHex((imm20 << 31) | (imm19_12 << 12) | (imm11 << 20) | (imm10_1 << 21) | (rd << 7) | opcode);
}

function parseRegister(regStr) {
    if (!regStr) throw new Error("Missing register");
    regStr = regStr.toLowerCase();
    if (REGISTER_MAP.hasOwnProperty(regStr)) return REGISTER_MAP[regStr];
    if (regStr.startsWith('x')) return parseInt(regStr.substring(1));
    throw new Error(`Invalid register: ${regStr}`);
}

function parseImmediate(immStr) {
    return parseInt(immStr);
}

function toHex(value) {
    return (value >>> 0).toString(16).padStart(8, '0').toUpperCase();
}