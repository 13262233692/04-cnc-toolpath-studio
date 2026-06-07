use super::GCodeError;

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Letter(char),
    Number(f64),
    Address(char, f64),
    N(usize),
    GCode(u32, Option<u32>),
    MCode(u32),
    SCode(f64),
    FCode(f64),
    TCode(u32),
    Comment(String),
    MacroVar(u32),
    MacroAssign,
    MacroEQ,
    MacroNE,
    MacroGT,
    MacroGE,
    MacroLT,
    MacroLE,
    MacroAND,
    MacroOR,
    MacroNOT,
    MacroIF,
    MacroTHEN,
    MacroELSE,
    MacroENDIF,
    MacroWHILE,
    MacroDO,
    MacroEND,
    MacroGOTO,
    MacroCALL,
    MacroRET,
    Plus,
    Minus,
    Star,
    Slash,
    Mod,
    Power,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Comma,
    Semicolon,
    NewLine,
    EOF,
}

#[derive(Debug, Clone)]
pub struct TokenWithLine {
    pub token: Token,
    pub line: usize,
}

pub fn tokenize(content: &str) -> Result<Vec<TokenWithLine>, GCodeError> {
    let mut tokens = Vec::new();
    let mut line_number = 1;
    let chars: Vec<char> = content.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        match c {
            ' ' | '\t' | '\r' => {
                i += 1;
            }
            '\n' => {
                tokens.push(TokenWithLine {
                    token: Token::NewLine,
                    line: line_number,
                });
                line_number += 1;
                i += 1;
            }
            ';' => {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '(' => {
                i += 1;
                let mut comment = String::new();
                while i < chars.len() && chars[i] != ')' {
                    if chars[i] == '\n' {
                        line_number += 1;
                    }
                    comment.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    i += 1;
                }
                tokens.push(TokenWithLine {
                    token: Token::Comment(comment),
                    line: line_number,
                });
            }
            '%' => {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '#' => {
                i += 1;
                let mut num_str = String::new();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    num_str.push(chars[i]);
                    i += 1;
                }
                let var_num = num_str.parse::<u32>().map_err(|_| GCodeError::LexError {
                    line: line_number,
                    message: "Invalid macro variable number".to_string(),
                })?;
                tokens.push(TokenWithLine {
                    token: Token::MacroVar(var_num),
                    line: line_number,
                });
            }
            '=' => {
                i += 1;
                if i < chars.len() && chars[i] == '=' {
                    tokens.push(TokenWithLine {
                        token: Token::MacroEQ,
                        line: line_number,
                    });
                    i += 1;
                } else {
                    tokens.push(TokenWithLine {
                        token: Token::MacroAssign,
                        line: line_number,
                    });
                }
            }
            '!' => {
                i += 1;
                if i < chars.len() && chars[i] == '=' {
                    tokens.push(TokenWithLine {
                        token: Token::MacroNE,
                        line: line_number,
                    });
                    i += 1;
                } else {
                    tokens.push(TokenWithLine {
                        token: Token::MacroNOT,
                        line: line_number,
                    });
                }
            }
            '>' => {
                i += 1;
                if i < chars.len() && chars[i] == '=' {
                    tokens.push(TokenWithLine {
                        token: Token::MacroGE,
                        line: line_number,
                    });
                    i += 1;
                } else {
                    tokens.push(TokenWithLine {
                        token: Token::MacroGT,
                        line: line_number,
                    });
                }
            }
            '<' => {
                i += 1;
                if i < chars.len() && chars[i] == '=' {
                    tokens.push(TokenWithLine {
                        token: Token::MacroLE,
                        line: line_number,
                    });
                    i += 1;
                } else {
                    tokens.push(TokenWithLine {
                        token: Token::MacroLT,
                        line: line_number,
                    });
                }
            }
            '&' => {
                i += 1;
                if i < chars.len() && chars[i] == '&' {
                    tokens.push(TokenWithLine {
                        token: Token::MacroAND,
                        line: line_number,
                    });
                    i += 1;
                } else {
                    return Err(GCodeError::LexError {
                        line: line_number,
                        message: "Expected '&&'".to_string(),
                    });
                }
            }
            '|' => {
                i += 1;
                if i < chars.len() && chars[i] == '|' {
                    tokens.push(TokenWithLine {
                        token: Token::MacroOR,
                        line: line_number,
                    });
                    i += 1;
                } else {
                    return Err(GCodeError::LexError {
                        line: line_number,
                        message: "Expected '||'".to_string(),
                    });
                }
            }
            '+' => {
                tokens.push(TokenWithLine {
                    token: Token::Plus,
                    line: line_number,
                });
                i += 1;
            }
            '-' => {
                tokens.push(TokenWithLine {
                    token: Token::Minus,
                    line: line_number,
                });
                i += 1;
            }
            '*' => {
                tokens.push(TokenWithLine {
                    token: Token::Star,
                    line: line_number,
                });
                i += 1;
            }
            '/' => {
                tokens.push(TokenWithLine {
                    token: Token::Slash,
                    line: line_number,
                });
                i += 1;
            }
            '^' => {
                tokens.push(TokenWithLine {
                    token: Token::Power,
                    line: line_number,
                });
                i += 1;
            }
            ')' => {
                tokens.push(TokenWithLine {
                    token: Token::RParen,
                    line: line_number,
                });
                i += 1;
            }
            '[' => {
                tokens.push(TokenWithLine {
                    token: Token::LBracket,
                    line: line_number,
                });
                i += 1;
            }
            ']' => {
                tokens.push(TokenWithLine {
                    token: Token::RBracket,
                    line: line_number,
                });
                i += 1;
            }
            ',' => {
                tokens.push(TokenWithLine {
                    token: Token::Comma,
                    line: line_number,
                });
                i += 1;
            }
            'N' | 'n' => {
                i += 1;
                let mut num_str = String::new();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    num_str.push(chars[i]);
                    i += 1;
                }
                let num = num_str.parse::<usize>().map_err(|_| GCodeError::LexError {
                    line: line_number,
                    message: "Invalid line number".to_string(),
                })?;
                tokens.push(TokenWithLine {
                    token: Token::N(num),
                    line: line_number,
                });
            }
            'G' | 'g' => {
                i += 1;
                let mut num_str = String::new();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    num_str.push(chars[i]);
                    i += 1;
                }
                let num = num_str.parse::<u32>().map_err(|_| GCodeError::LexError {
                    line: line_number,
                    message: "Invalid G-code number".to_string(),
                })?;
                let mut subcode = None;
                if i < chars.len() && chars[i] == '.' {
                    i += 1;
                    let mut sub_str = String::new();
                    while i < chars.len() && chars[i].is_ascii_digit() {
                        sub_str.push(chars[i]);
                        i += 1;
                    }
                    subcode = Some(sub_str.parse::<u32>().map_err(|_| GCodeError::LexError {
                        line: line_number,
                        message: "Invalid G-code subcode".to_string(),
                    })?);
                }
                tokens.push(TokenWithLine {
                    token: Token::GCode(num, subcode),
                    line: line_number,
                });
            }
            'M' | 'm' => {
                i += 1;
                let mut num_str = String::new();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    num_str.push(chars[i]);
                    i += 1;
                }
                let num = num_str.parse::<u32>().map_err(|_| GCodeError::LexError {
                    line: line_number,
                    message: "Invalid M-code number".to_string(),
                })?;
                tokens.push(TokenWithLine {
                    token: Token::MCode(num),
                    line: line_number,
                });
            }
            'S' | 's' => {
                i += 1;
                let num = parse_number(&chars, &mut i, line_number)?;
                tokens.push(TokenWithLine {
                    token: Token::SCode(num),
                    line: line_number,
                });
            }
            'F' | 'f' => {
                i += 1;
                let num = parse_number(&chars, &mut i, line_number)?;
                tokens.push(TokenWithLine {
                    token: Token::FCode(num),
                    line: line_number,
                });
            }
            'T' | 't' => {
                i += 1;
                let mut num_str = String::new();
                while i < chars.len() && chars[i].is_ascii_digit() {
                    num_str.push(chars[i]);
                    i += 1;
                }
                let num = num_str.parse::<u32>().map_err(|_| GCodeError::LexError {
                    line: line_number,
                    message: "Invalid T-code number".to_string(),
                })?;
                tokens.push(TokenWithLine {
                    token: Token::TCode(num),
                    line: line_number,
                });
            }
            'X' | 'x' | 'Y' | 'y' | 'Z' | 'z' | 'A' | 'a' | 'B' | 'b' | 'C' | 'c'
            | 'I' | 'i' | 'J' | 'j' | 'K' | 'k' | 'R' | 'r' | 'P' | 'p' | 'Q' | 'q'
            | 'H' | 'h' | 'D' | 'd' | 'E' | 'e' => {
                let letter = c.to_ascii_uppercase();
                i += 1;
                let num = parse_number(&chars, &mut i, line_number)?;
                tokens.push(TokenWithLine {
                    token: Token::Address(letter, num),
                    line: line_number,
                });
            }
            c if c.is_ascii_alphabetic() => {
                let upper = c.to_ascii_uppercase();
                let word = read_word(&chars, &mut i);
                match word.as_str() {
                    "IF" => tokens.push(TokenWithLine {
                        token: Token::MacroIF,
                        line: line_number,
                    }),
                    "THEN" => tokens.push(TokenWithLine {
                        token: Token::MacroTHEN,
                        line: line_number,
                    }),
                    "ELSE" => tokens.push(TokenWithLine {
                        token: Token::MacroELSE,
                        line: line_number,
                    }),
                    "ENDIF" => tokens.push(TokenWithLine {
                        token: Token::MacroENDIF,
                        line: line_number,
                    }),
                    "WHILE" => tokens.push(TokenWithLine {
                        token: Token::MacroWHILE,
                        line: line_number,
                    }),
                    "DO" => tokens.push(TokenWithLine {
                        token: Token::MacroDO,
                        line: line_number,
                    }),
                    "END" => tokens.push(TokenWithLine {
                        token: Token::MacroEND,
                        line: line_number,
                    }),
                    "GOTO" => tokens.push(TokenWithLine {
                        token: Token::MacroGOTO,
                        line: line_number,
                    }),
                    "CALL" => tokens.push(TokenWithLine {
                        token: Token::MacroCALL,
                        line: line_number,
                    }),
                    "RET" => tokens.push(TokenWithLine {
                        token: Token::MacroRET,
                        line: line_number,
                    }),
                    _ => tokens.push(TokenWithLine {
                        token: Token::Letter(upper),
                        line: line_number,
                    }),
                }
            }
            c if c.is_ascii_digit() || c == '.' => {
                let num = parse_number(&chars, &mut i, line_number)?;
                tokens.push(TokenWithLine {
                    token: Token::Number(num),
                    line: line_number,
                });
            }
            _ => {
                return Err(GCodeError::LexError {
                    line: line_number,
                    message: format!("Unexpected character: '{}'", c),
                });
            }
        }
    }

    tokens.push(TokenWithLine {
        token: Token::EOF,
        line: line_number,
    });

    Ok(tokens)
}

fn parse_number(chars: &[char], i: &mut usize, line: usize) -> Result<f64, GCodeError> {
    let mut num_str = String::new();
    if *i < chars.len() && chars[*i] == '-' {
        num_str.push('-');
        *i += 1;
    } else if *i < chars.len() && chars[*i] == '+' {
        *i += 1;
    }
    while *i < chars.len() && (chars[*i].is_ascii_digit() || chars[*i] == '.') {
        num_str.push(chars[*i]);
        *i += 1;
    }
    num_str.parse::<f64>().map_err(|_| GCodeError::LexError {
        line,
        message: format!("Invalid number: '{}'", num_str),
    })
}

fn read_word(chars: &[char], i: &mut usize) -> String {
    let mut word = String::new();
    while *i < chars.len() && chars[*i].is_ascii_alphanumeric() {
        word.push(chars[*i].to_ascii_uppercase());
        *i += 1;
    }
    word
}
