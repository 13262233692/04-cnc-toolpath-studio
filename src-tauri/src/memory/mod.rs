use byteorder::{LittleEndian, WriteBytesExt};
use memmap2::MmapMut;
use std::fs::OpenOptions;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ID: AtomicU64 = AtomicU64::new(0);

pub struct SharedMemoryBuffer {
    mmap: MmapMut,
    path: PathBuf,
    size: usize,
}

impl SharedMemoryBuffer {
    pub fn new(size: usize) -> io::Result<Self> {
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        let path = PathBuf::from(format!("cnc_toolpath_shm_{}.bin", id));

        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)?;

        file.set_len(size as u64)?;

        let mmap = unsafe { MmapMut::map_mut(&file)? };

        Ok(SharedMemoryBuffer { mmap, path, size })
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.mmap
    }

    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.mmap
    }

    pub fn size(&self) -> usize {
        self.size
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }
}

impl Drop for SharedMemoryBuffer {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

pub fn serialize_f32_slice(data: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(data.len() * 4);
    for &val in data {
        bytes.write_f32::<LittleEndian>(val).unwrap();
    }
    bytes
}

pub fn serialize_f64_slice(data: &[f64]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(data.len() * 8);
    for &val in data {
        bytes.write_f64::<LittleEndian>(val).unwrap();
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shared_memory() {
        let mut buf = SharedMemoryBuffer::new(1024).unwrap();
        let data = buf.as_mut_slice();
        data[0] = 42;
        assert_eq!(buf.as_slice()[0], 42);
    }

    #[test]
    fn test_serialize_f32() {
        let data = vec![1.0f32, 2.0, 3.0];
        let bytes = serialize_f32_slice(&data);
        assert_eq!(bytes.len(), 12);
    }
}
