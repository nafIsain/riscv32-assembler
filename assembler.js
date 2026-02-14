document.getElementById('assembleBtn').addEventListener('click', assemble);

function assemble() {
    const input = document.getElementById('asmInput').value;
    const outputArea = document.getElementById('hexOutput');
    const logArea = document.getElementById('log');
    
    // Clear previous output
    outputArea.value = '';
    logArea.innerHTML = '';

    const lines = input.split('\n');
    let machineCode = [];

    lines.forEach((line, index) => {
        // 1. Clean the line: Remove comments (# or //) and trim whitespace
        let cleanLine = line.split('#')[0].split('//')[0].trim();
        
        if (cleanLine === '') return; // Skip empty lines

        // 2. Parse the instruction
        // Regex explains: 
        // ^(\w+)\s+ -> Opcode at start (e.g., "add ")
        // (.*)      -> The rest (operands)
        // This is a naive parser, we will upgrade it for labels later.
        
        // Simple tokenizer: split by space or comma
        // Replace commas with spaces, then split by whitespace to get tokens
        let tokens = cleanLine.replace(/,/g, ' ').trim().split(/\s+/);
        
        try {
            let hex = processInstruction(tokens);
            machineCode.push(hex);
        } catch (e) {
            logArea.innerHTML += `Line ${index + 1} Error: ${e.message}<br>`;
        }
    });

    outputArea.value = machineCode.join('\n');
}

function processInstruction(tokens) {
    const opcode = tokens[0].toLowerCase();
    
    // This is where the magic happens. 
    // We will expand this switch case for all RV32I instructions.
    
    switch (opcode) {
        case 'add':
            return encodeRType(tokens);
        // We will add more cases here in Phase 2
        default:
            throw new Error(`Unknown opcode: ${opcode}`);
    }
}

// R-Type: funct7 | rs2 | rs1 | funct3 | rd | opcode
function encodeRType(tokens) {
    // Expected syntax: add rd, rs1, rs2 -> tokens: ["add", "x1", "x2", "x3"]
    if (tokens.length !== 4) throw new Error("Invalid operand count for R-Type");

    const rd = parseRegister(tokens[1]);
    const rs1 = parseRegister(tokens[2]);
    const rs2 = parseRegister(tokens[3]);

    // Opcode for R-type (0110011) -> 0x33
    const opcode = 0x33;
    const funct3 = 0x0; // ADD funct3 is 0
    const funct7 = 0x00; // ADD funct7 is 0
    
    // Construct the 32-bit integer
    // (funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode
    
    let instruction = 
        (funct7 << 25) | 
        (rs2 << 20) | 
        (rs1 << 15) | 
        (funct3 << 12) | 
        (rd << 7) | 
        opcode;

    // Convert to unsigned 32-bit hex string
    return (instruction >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function parseRegister(regStr) {
    // Handle x0-x31 and ABI names (zero, ra, sp, etc.) later.
    // For now, assume format "xN" or just "N"
    if (regStr.startsWith('x')) {
        return parseInt(regStr.substring(1));
    }
    return parseInt(regStr);
}