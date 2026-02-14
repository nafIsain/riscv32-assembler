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

    lines.forEach((line, index) => {
        try {
            // Clean: remove comments, trim
            let cleanLine = line.split('#')[0].split('//')[0].trim();
            if (!cleanLine) return; 

            // Tokenize: split by space or comma
            let tokens = cleanLine.replace(/,/g, ' ').trim().split(/\s+/);
            
            let hex = processInstruction(tokens);
            machineCode.push(hex);
        } catch (e) {
            logArea.innerHTML += `Line ${index + 1} Error: ${e.message}<br>`;
        }
    });

    outputArea.value = machineCode.join('\n');
}

function processInstruction(tokens) {
    const opcodeName = tokens[0].toLowerCase();

    // Map instructions to their types and codes
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
        case 'slli': return encodeIType(tokens, 0x13, 0x1); // diff format (shamt), but I-type fits
        case 'srli': return encodeIType(tokens, 0x13, 0x5); 
        case 'srai': return encodeIType(tokens, 0x13, 0x5, 0x20); // Handled specially inside? actually just high bits of imm.

        // I-Type (Loads)
        case 'lb':   return encodeIType(tokens, 0x03, 0x0);
        case 'lh':   return encodeIType(tokens, 0x03, 0x1);
        case 'lw':   return encodeIType(tokens, 0x03, 0x2);
        case 'lbu':  return encodeIType(tokens, 0x03, 0x4);
        case 'lhu':  return encodeIType(tokens, 0x03, 0x5);

        // I-Type (JALR)
        case 'jalr': return encodeIType(tokens, 0x67, 0x0);
        
        default:
            throw new Error(`Unknown instruction: ${opcodeName}`);
    }
}

// --- HELPER FUNCTIONS ---

function parseRegister(regStr) {
    if (!regStr) throw new Error("Missing register operand");
    regStr = regStr.toLowerCase();
    
    // Check ABI map first (sp, ra, etc.)
    if (REGISTER_MAP.hasOwnProperty(regStr)) {
        return REGISTER_MAP[regStr];
    }
    
    // Check x0-x31
    if (regStr.startsWith('x')) {
        const num = parseInt(regStr.substring(1));
        if (num >= 0 && num <= 31) return num;
    }
    
    throw new Error(`Invalid register: ${regStr}`);
}

function parseImmediate(immStr) {
    if (!immStr) throw new Error("Missing immediate operand");
    // Handles hex (0x10), binary (0b10), and decimal (-10)
    let val = parseInt(immStr); 
    if (isNaN(val)) throw new Error(`Invalid immediate: ${immStr}`);
    return val;
}

// R-Type: funct7 | rs2 | rs1 | funct3 | rd | opcode
function encodeRType(tokens, opcode, funct3, funct7) {
    if (tokens.length !== 4) throw new Error("R-Type requires 3 operands (rd, rs1, rs2)");
    const rd = parseRegister(tokens[1]);
    const rs1 = parseRegister(tokens[2]);
    const rs2 = parseRegister(tokens[3]);

    const instruction = 
        (funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode;
    
    return toHex(instruction);
}

// I-Type: imm[11:0] | rs1 | funct3 | rd | opcode
function encodeIType(tokens, opcode, funct3, specialFunct7 = 0) {
    // Standard I-Type: addi rd, rs1, imm
    // Load I-Type:     lw rd, imm(rs1)  <-- We need to handle this syntax!
    
    let rd, rs1, imm;

    // Check for Load Syntax: lw x1, 0(x2)
    const loadRegex = /^(-?\d+|0x[0-9a-fA-F]+)\(([a-zA-Z0-9]+)\)$/;
    const match = tokens[2].match(loadRegex);

    if (match) {
        // Syntax is: lw rd, offset(base)
        // tokens = ["lw", "rd", "offset(base)"]
        rd = parseRegister(tokens[1]);
        imm = parseImmediate(match[1]);
        rs1 = parseRegister(match[2]);
    } else {
        // Standard Syntax: addi rd, rs1, imm
        if (tokens.length !== 4) throw new Error("I-Type requires 3 operands");
        rd = parseRegister(tokens[1]);
        rs1 = parseRegister(tokens[2]);
        imm = parseImmediate(tokens[3]);
    }

    // Handle shift immediates (srai, srli, slli) - only 5 bits, top 7 bits are funct7
    // For SRAI, specialFunct7 is 0x20 (0100000). For others it's 0.
    if (specialFunct7 !== 0) {
        imm = imm & 0x1F; // Only keep bottom 5 bits
        imm = imm | (specialFunct7 << 5); // Add the funct7 code
    }

    // Sign extension handling for 12-bit immediates
    // JS bitwise ops are 32-bit signed, but we need to pack bits carefully.
    // If imm is -1 (0xFFFFFFFF), we need 0xFFF.
    const imm12 = imm & 0xFFF; 

    const instruction = 
        (imm12 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode;

    return toHex(instruction);
}

function toHex(value) {
    // Force unsigned 32-bit
    return (value >>> 0).toString(16).padStart(8, '0').toUpperCase();
}