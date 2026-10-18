//! Creates replacement files with source security before any content is written.
#![allow(unsafe_code)] // Narrow owned-handle Win32 wrapper, not a path-based permission setter.
use std::{
    fs::File,
    io,
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle},
    },
    path::Path,
    ptr,
};
use windows_sys::Win32::{
    Foundation::{INVALID_HANDLE_VALUE, LocalFree},
    Security::{
        Authorization::{GetSecurityInfo, SE_FILE_OBJECT},
        DACL_SECURITY_INFORMATION, GROUP_SECURITY_INFORMATION, OWNER_SECURITY_INFORMATION,
        PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES,
    },
    Storage::FileSystem::{
        CREATE_NEW, CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_DELETE, FILE_SHARE_READ,
        FILE_SHARE_WRITE,
    },
};
const INFORMATION: u32 =
    OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
struct Descriptor {
    allocation: PSECURITY_DESCRIPTOR,
    #[cfg(test)]
    acl: *mut windows_sys::Win32::Security::ACL,
}
impl Drop for Descriptor {
    fn drop(&mut self) {
        // SAFETY: successful GetSecurityInfo returned a LocalAlloc-owned buffer, freed once.
        unsafe {
            LocalFree(self.allocation);
        }
    }
}
fn status(result: u32) -> io::Result<()> {
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(
            i32::try_from(result).unwrap_or(1),
        ))
    }
}
fn descriptor(file: &File) -> io::Result<Descriptor> {
    let mut allocation = ptr::null_mut();
    let mut acl = ptr::null_mut();
    // SAFETY: File owns a live handle; outputs refer to initialized local variables.
    // Requested owner/group/DACL are included in the returned descriptor.
    status(unsafe {
        GetSecurityInfo(
            file.as_raw_handle(),
            SE_FILE_OBJECT,
            INFORMATION,
            ptr::null_mut(),
            ptr::null_mut(),
            &raw mut acl,
            ptr::null_mut(),
            &raw mut allocation,
        )
    })?;
    if allocation.is_null() {
        return Err(io::Error::other("missing security descriptor"));
    }
    Ok(Descriptor {
        allocation,
        #[cfg(test)]
        acl,
    })
}
pub(super) fn create_replacement(path: &Path, source: &File) -> io::Result<File> {
    let descriptor = descriptor(source)?;
    let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let attributes = SECURITY_ATTRIBUTES {
        nLength: u32::try_from(size_of::<SECURITY_ATTRIBUTES>()).map_err(io::Error::other)?,
        lpSecurityDescriptor: descriptor.allocation,
        bInheritHandle: 0,
    };
    // SAFETY: UTF-16 name is NUL-terminated; attributes/descriptor stay live for this
    // synchronous call. CREATE_NEW rejects existing files, links and collisions.
    // Source security is applied at creation, before exposing any temporary content.
    let handle = unsafe {
        CreateFileW(
            name.as_ptr(),
            0xC000_0000,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            &raw const attributes,
            CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL,
            ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: CreateFileW returned a new valid owned handle; ownership transfers once.
    Ok(unsafe { File::from_raw_handle(handle) })
}
pub(super) fn rename(file: &File, destination: &Path) -> io::Result<()> {
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_RENAME_INFO, FILE_RENAME_INFO_0, FileRenameInfo, SetFileInformationByHandle,
    };
    let name: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let filename_bytes = name
        .len()
        .checked_mul(2)
        .ok_or_else(|| io::Error::other("name too long"))?;
    let buffer_size = size_of::<FILE_RENAME_INFO>()
        .checked_add(filename_bytes)
        .ok_or_else(|| io::Error::other("name too long"))?;
    let mut buffer = vec![0_u64; buffer_size.div_ceil(size_of::<u64>())];
    let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    // SAFETY: u64 storage has the required alignment on Windows x64 and enough bytes
    // for the header plus UTF-16 name. All fields/padding are initialized; no overwrite.
    unsafe {
        (*info).Anonymous = FILE_RENAME_INFO_0 { Flags: 0 };
        (*info).RootDirectory = ptr::null_mut();
        (*info).FileNameLength = u32::try_from(filename_bytes - 2).map_err(io::Error::other)?;
        ptr::copy_nonoverlapping(
            name.as_ptr(),
            ptr::addr_of_mut!((*info).FileName).cast::<u16>(),
            name.len(),
        );
        if SetFileInformationByHandle(
            file.as_raw_handle(),
            FileRenameInfo,
            info.cast(),
            u32::try_from(buffer_size).map_err(io::Error::other)?,
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

pub(super) fn delete(file: &File) -> io::Result<()> {
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_DISPOSITION_INFO, FileDispositionInfo, SetFileInformationByHandle,
    };
    let info = FILE_DISPOSITION_INFO { DeleteFile: true };
    // SAFETY: file owns a live DELETE-capable handle; the initialized structure
    // stays live throughout the synchronous call. Only this opened file is marked.
    if unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FileDispositionInfo,
            ptr::from_ref(&info).cast(),
            u32::try_from(size_of::<FILE_DISPOSITION_INFO>()).map_err(io::Error::other)?,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

/// Stable identity of a live handle, used to reject a directory replaced during preflight.
pub(super) fn identity(file: &File) -> io::Result<(u32, u64)> {
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
    };
    let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
    // SAFETY: file owns a live handle and info provides aligned writable output storage.
    // No output is read when the synchronous API reports failure.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: successful GetFileInformationByHandle initialized the complete POD structure.
    let info = unsafe { info.assume_init() };
    Ok((
        info.dwVolumeSerialNumber,
        (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs::OpenOptions, os::windows::fs::OpenOptionsExt};
    use windows_sys::Win32::Security::{
        Authorization::SetSecurityInfo, GetSecurityDescriptorControl,
        PROTECTED_DACL_SECURITY_INFORMATION, SE_DACL_PROTECTED,
    };
    fn protected(descriptor: &Descriptor) -> bool {
        let mut control = 0;
        let mut revision = 0;
        // SAFETY: descriptor and outputs remain valid for the call.
        assert_ne!(
            unsafe {
                GetSecurityDescriptorControl(
                    descriptor.allocation,
                    &raw mut control,
                    &raw mut revision,
                )
            },
            0
        );
        control & SE_DACL_PROTECTED != 0
    }
    #[test]
    fn replacement_starts_with_source_protected_dacl() {
        let temp = tempfile::tempdir().unwrap();
        let source = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .access_mode(0xC00E_0000)
            .open(temp.path().join("source"))
            .unwrap();
        let original = descriptor(&source).unwrap();
        // SAFETY: source/original ACL are live; only this fixture's DACL is changed.
        status(unsafe {
            SetSecurityInfo(
                source.as_raw_handle(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                ptr::null_mut(),
                ptr::null_mut(),
                original.acl,
                ptr::null(),
            )
        })
        .unwrap();
        let replacement = create_replacement(&temp.path().join("replacement"), &source).unwrap();
        let source_descriptor = descriptor(&source).unwrap();
        let replacement_descriptor = descriptor(&replacement).unwrap();
        assert!(protected(&source_descriptor));
        assert!(protected(&replacement_descriptor));
        // SAFETY: these ACL buffers belong to live descriptors; Windows supplies AclSize.
        unsafe {
            assert!(!source_descriptor.acl.is_null() && !replacement_descriptor.acl.is_null());
            assert_eq!(
                std::slice::from_raw_parts(
                    source_descriptor.acl.cast::<u8>(),
                    usize::from((*source_descriptor.acl).AclSize)
                ),
                std::slice::from_raw_parts(
                    replacement_descriptor.acl.cast::<u8>(),
                    usize::from((*replacement_descriptor.acl).AclSize)
                )
            );
        }
        assert!(create_replacement(&temp.path().join("replacement"), &source).is_err());
    }
}
