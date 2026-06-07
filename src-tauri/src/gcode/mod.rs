pub mod lexer;
pub mod parser;
pub mod interpolator;

use crate::models::*;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GCodeError {
    #[error("Lexical error at line {line}: {message}")]
    LexError { line: usize, message: String },
    #[error("Parse error at line {line}: {message}")]
    ParseError { line: usize, message: String },
    #[error("Interpolation error: {0}")]
    InterpolationError(String),
}

pub fn parse_gcode(content: &str) -> Result<ToolpathData, GCodeError> {
    let tokens = lexer::tokenize(content)?;
    let blocks = parser::parse(tokens)?;
    let toolpath = interpolator::interpolate(blocks)?;
    Ok(toolpath)
}
