"""
Force re-sync of all files from server to virtual drive
This will re-download all files, overwriting any corrupted ones
"""

import json
import sys
from pathlib import Path

def clear_sync_state(virtual_drive_path: str):
    """Clear the sync state to force re-download of all files"""
    sync_state_file = Path(virtual_drive_path) / '.sync_state.json'
    
    if sync_state_file.exists():
        # Backup the old state
        backup_file = sync_state_file.with_suffix('.json.backup')
        if backup_file.exists():
            backup_file.unlink()
        sync_state_file.rename(backup_file)
        print(f"✓ Backed up sync state to: {backup_file}")
        print(f"✓ Cleared sync state - all files will be re-downloaded on next sync")
        return True
    else:
        print(f"⚠️  Sync state file not found: {sync_state_file}")
        print("   This might be the first sync, or sync state is stored elsewhere")
        return False

def clear_specific_files(virtual_drive_path: str, document_ids: list = None):
    """Clear sync state for specific document IDs"""
    sync_state_file = Path(virtual_drive_path) / '.sync_state.json'
    
    if not sync_state_file.exists():
        print(f"⚠️  Sync state file not found: {sync_state_file}")
        return False
    
    try:
        with open(sync_state_file, 'r') as f:
            sync_state = json.load(f)
        
        if document_ids:
            # Remove specific document IDs
            removed = 0
            for doc_id in document_ids:
                if str(doc_id) in sync_state:
                    del sync_state[str(doc_id)]
                    removed += 1
            print(f"✓ Removed {removed} document(s) from sync state")
        else:
            # Clear all
            sync_state = {}
            print(f"✓ Cleared all sync state")
        
        # Backup
        backup_file = sync_state_file.with_suffix('.json.backup')
        if not backup_file.exists():
            with open(sync_state_file, 'r') as f:
                backup_data = f.read()
            with open(backup_file, 'w') as f:
                f.write(backup_data)
            print(f"✓ Backed up sync state to: {backup_file}")
        
        # Save cleared state
        with open(sync_state_file, 'w') as f:
            json.dump(sync_state, f, indent=2)
        
        return True
    except Exception as e:
        print(f"✗ Error clearing sync state: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python force_resync.py <virtual_drive_path> [--all] [--doc-ids 1158,1162]")
        print("")
        print("Options:")
        print("  --all              Clear all sync state (force re-download all files)")
        print("  --doc-ids ID1,ID2  Clear sync state for specific document IDs only")
        print("")
        print("Example:")
        print("  python force_resync.py Z:\\LawFirm --all")
        print("  python force_resync.py Z:\\LawFirm --doc-ids 1158,1162")
        sys.exit(1)
    
    virtual_drive_path = sys.argv[1]
    
    if '--all' in sys.argv:
        clear_sync_state(virtual_drive_path)
    elif '--doc-ids' in sys.argv:
        idx = sys.argv.index('--doc-ids')
        if idx + 1 < len(sys.argv):
            doc_ids = [int(x.strip()) for x in sys.argv[idx + 1].split(',')]
            clear_specific_files(virtual_drive_path, doc_ids)
        else:
            print("✗ Error: --doc-ids requires document IDs (comma-separated)")
            sys.exit(1)
    else:
        # Default: clear all
        clear_sync_state(virtual_drive_path)
