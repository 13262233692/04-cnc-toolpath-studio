use super::lexer::{Token, TokenWithLine};
use super::GCodeError;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub enum MotionType {
    Rapid,
    Linear,
    ClockwiseArc,
    CounterClockwiseArc,
    Dwell,
}

#[derive(Debug, Clone)]
pub struct BlockData {
    pub line_number: usize,
    pub motion: Option<MotionType>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z: Option<f64>,
    pub a: Option<f64>,
    pub b: Option<f64>,
    pub c: Option<f64>,
    pub i: Option<f64>,
    pub j: Option<f64>,
    pub k: Option<f64>,
    pub r: Option<f64>,
    pub feed: Option<f64>,
    pub spindle: Option<f64>,
    pub dwell_time: Option<f64>,
    pub g_codes: Vec<(u32, Option<u32>)>,
    pub m_codes: Vec<u32>,
    pub comment: Option<String>,
}

impl Default for BlockData {
    fn default() -> Self {
        BlockData {
            line_number: 0,
            motion: None,
            x: None,
            y: None,
            z: None,
            a: None,
            b: None,
            c: None,
            i: None,
            j: None,
            k: None,
            r: None,
            feed: None,
            spindle: None,
            dwell_time: None,
            g_codes: Vec::new(),
            m_codes: Vec::new(),
            comment: None,
        }
    }
}

pub struct Parser {
    tokens: Vec<TokenWithLine>,
    pos: usize,
    macro_vars: HashMap<u32, f64>,
}

impl Parser {
    pub fn new(tokens: Vec<TokenWithLine>) -> Self {
        Parser {
            tokens,
            pos: 0,
            macro_vars: HashMap::new(),
        }
    }

    fn current(&self) -> &TokenWithLine {
        &self.tokens[self.pos]
    }

    fn peek(&self) -> Option<&TokenWithLine> {
        self.tokens.get(self.pos + 1)
    }

    fn advance(&mut self) {
        if self.pos < self.tokens.len() - 1 {
            self.pos += 1;
        }
    }

    fn is_eof(&self) -> bool {
        matches!(self.current().token, Token::EOF)
    }

    fn current_line(&self) -> usize {
        self.current().line
    }

    pub fn parse(&mut self) -> Result<Vec<BlockData>, GCodeError> {
        let mut blocks = Vec::new();

        while !self.is_eof() {
            while matches!(self.current().token, Token::NewLine) {
                self.advance();
            }
            if self.is_eof() {
                break;
            }

            let block = self.parse_block()?;
            if let Some(block) = block {
                blocks.push(block);
            }

            while matches!(self.current().token, Token::NewLine) {
                self.advance();
            }
        }

        Ok(blocks)
    }

    fn parse_block(&mut self) -> Result<Option<BlockData>, GCodeError> {
        let mut block = BlockData::default();
        block.line_number = self.current_line();

        while !self.is_eof() && !matches!(self.current().token, Token::NewLine) {
            let token = &self.current().token;

            match token {
                Token::N(n) => {
                    block.line_number = *n;
                    self.advance();
                }
                Token::GCode(code, sub) => {
                    block.g_codes.push((*code, *sub));
                    self.apply_g_code(*code, *sub, &mut block)?;
                    self.advance();
                }
                Token::MCode(code) => {
                    block.m_codes.push(*code);
                    self.advance();
                }
                Token::Address(addr, value) => {
                    match addr {
                        'X' => block.x = Some(*value),
                        'Y' => block.y = Some(*value),
                        'Z' => block.z = Some(*value),
                        'A' => block.a = Some(*value),
                        'B' => block.b = Some(*value),
                        'C' => block.c = Some(*value),
                        'I' => block.i = Some(*value),
                        'J' => block.j = Some(*value),
                        'K' => block.k = Some(*value),
                        'R' => block.r = Some(*value),
                        'P' => block.dwell_time = Some(*value),
                        _ => {}
                    }
                    self.advance();
                }
                Token::FCode(f) => {
                    block.feed = Some(*f);
                    self.advance();
                }
                Token::SCode(s) => {
                    block.spindle = Some(*s);
                    self.advance();
                }
                Token::Comment(c) => {
                    block.comment = Some(c.clone());
                    self.advance();
                }
                Token::MacroVar(_)
                | Token::MacroIF
                | Token::MacroWHILE
                | Token::MacroGOTO => {
                    self.skip_macro_block()?;
                }
                Token::EOF => break,
                _ => {
                    self.advance();
                }
            }
        }

        if block.g_codes.is_empty()
            && block.m_codes.is_empty()
            && block.x.is_none()
            && block.y.is_none()
            && block.z.is_none()
            && block.a.is_none()
            && block.b.is_none()
            && block.c.is_none()
        {
            return Ok(None);
        }

        Ok(Some(block))
    }

    fn apply_g_code(
        &mut self,
        code: u32,
        sub: Option<u32>,
        block: &mut BlockData,
    ) -> Result<(), GCodeError> {
        match (code, sub) {
            (0, _) => block.motion = Some(MotionType::Rapid),
            (1, _) => block.motion = Some(MotionType::Linear),
            (2, _) => block.motion = Some(MotionType::ClockwiseArc),
            (3, _) => block.motion = Some(MotionType::CounterClockwiseArc),
            (4, _) => block.motion = Some(MotionType::Dwell),
            _ => {}
        }
        Ok(())
    }

    fn skip_macro_block(&mut self) -> Result<(), GCodeError> {
        while !self.is_eof() && !matches!(self.current().token, Token::NewLine) {
            self.advance();
        }
        Ok(())
    }
}

pub fn parse(tokens: Vec<TokenWithLine>) -> Result<Vec<BlockData>, GCodeError> {
    let mut parser = Parser::new(tokens);
    parser.parse()
}
