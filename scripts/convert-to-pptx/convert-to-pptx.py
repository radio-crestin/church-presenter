#!/usr/bin/env python3
"""
PowerPoint Converter: .ppt to .pptx
Converts all .ppt files in a directory to .pptx format using LibreOffice on macOS or comtypes on Windows.
"""

import os
import sys
import platform
import argparse
import subprocess
import tempfile
import shutil
from pathlib import Path
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

def setup_logging(verbose=False):
    """Setup logging configuration"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(levelname)s - [%(threadName)s] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

# Thread-safe logging lock
log_lock = threading.Lock()

def find_libreoffice():
    """
    Find LibreOffice executable on macOS
    
    Returns:
        str: Path to LibreOffice executable or None if not found
    """
    common_paths = [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/local/bin/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/bin/soffice"
    ]
    
    # Check common installation paths
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    # Try to find it using which command
    try:
        result = subprocess.run(['which', 'soffice'], 
                              capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        pass
    
    # Try to find it using spotlight (macOS specific)
    try:
        result = subprocess.run(['mdfind', 'kMDItemCFBundleIdentifier == "org.libreoffice.script"'],
                              capture_output=True, text=True, check=True)
        if result.stdout.strip():
            app_path = result.stdout.strip().split('\n')[0]
            soffice_path = os.path.join(app_path, "Contents", "MacOS", "soffice")
            if os.path.exists(soffice_path):
                return soffice_path
    except subprocess.CalledProcessError:
        pass
    
    return None

def convert_with_libreoffice(input_path, output_path=None):
    """
    Convert a .ppt file to .pptx using LibreOffice
    
    Args:
        input_path (Path): Path to the input .ppt file
        output_path (Path): Path for the output .pptx file (optional)
    
    Returns:
        bool: True if conversion successful, False otherwise
    """
    soffice_path = find_libreoffice()
    if not soffice_path:
        logging.error("LibreOffice not found. Please install LibreOffice from https://www.libreoffice.org/")
        logging.error("Or install via Homebrew: brew install --cask libreoffice")
        return False
    
    input_path = Path(input_path)
    
    # Generate output path if not provided
    if output_path is None:
        output_path = input_path.with_suffix('.pptx')
    else:
        output_path = Path(output_path)
    
    # Create a temporary directory for LibreOffice output
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # LibreOffice command to convert
            cmd = [
                soffice_path,
                '--headless',
                '--convert-to', 'pptx',
                '--outdir', temp_dir,
                str(input_path.absolute())
            ]
            
            logging.debug(f"Running command: {' '.join(cmd)}")
            
            # Run LibreOffice conversion
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                logging.error(f"LibreOffice conversion failed: {result.stderr}")
                return False
            
            # Find the converted file in temp directory
            temp_output = Path(temp_dir) / f"{input_path.stem}.pptx"
            
            if not temp_output.exists():
                logging.error(f"Converted file not found in temp directory: {temp_output}")
                return False
            
            # Move the converted file to the desired output location
            shutil.move(str(temp_output), str(output_path))
            
            logging.info(f"Successfully converted: {input_path} → {output_path}")
            return True
            
        except subprocess.TimeoutExpired:
            logging.error(f"Conversion timed out for file: {input_path}")
            return False
        except Exception as e:
            logging.error(f"Error converting {input_path}: {str(e)}")
            return False

def convert_with_comtypes(input_path, output_path=None):
    """
    Convert a .ppt file to .pptx using comtypes (Windows only)
    
    Args:
        input_path (Path): Path to the input .ppt file
        output_path (Path): Path for the output .pptx file (optional)
    
    Returns:
        bool: True if conversion successful, False otherwise
    """
    try:
        import comtypes.client
    except ImportError:
        logging.error("comtypes is required for Windows PowerPoint conversion")
        logging.error("Install it with: pip install comtypes")
        return False
    
    input_path = Path(input_path)
    
    # Generate output path if not provided
    if output_path is None:
        output_path = input_path.with_suffix('.pptx')
    else:
        output_path = Path(output_path)
    
    try:
        # Initialize PowerPoint application
        logging.info(f"Converting {input_path} to {output_path}")
        powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
        powerpoint.Visible = 1  # Make PowerPoint visible (optional)
        
        # Open the .ppt file
        presentation = powerpoint.Presentations.Open(str(input_path.absolute()))
        
        # Save as .pptx (format 24 is for .pptx)
        presentation.SaveAs(str(output_path.absolute()), 24)
        
        # Close presentation and PowerPoint
        presentation.Close()
        powerpoint.Quit()
        
        logging.info(f"Successfully converted: {input_path} → {output_path}")
        return True
        
    except Exception as e:
        logging.error(f"Error converting {input_path}: {str(e)}")
        try:
            # Clean up PowerPoint if still running
            powerpoint.Quit()
        except:
            pass
        return False

def convert_single_file(input_path, output_path=None, replace_existing=True):
    """
    Convert a single .ppt file to .pptx format (thread-safe version)
    
    Args:
        input_path (Path): Path to the input .ppt file
        output_path (Path): Path for the output .pptx file (optional)
        replace_existing (bool): Whether to replace existing .pptx files
    
    Returns:
        tuple: (success: bool, input_path: Path, output_path: Path, message: str)
    """
    input_path = Path(input_path)
    
    if not input_path.exists():
        return False, input_path, None, f"Input file not found: {input_path}"
    
    if input_path.suffix.lower() != '.ppt':
        return False, input_path, None, f"Input file is not a .ppt file: {input_path}"
    
    # Generate output path if not provided
    if output_path is None:
        output_path = input_path.with_suffix('.pptx')
    else:
        output_path = Path(output_path)
    
    # Check if output file already exists and we're not replacing
    if output_path.exists() and not replace_existing:
        return False, input_path, output_path, f"Output file already exists (skipped): {output_path}"
    
    # If output file exists and we're replacing, log that we're overwriting
    if output_path.exists() and replace_existing:
        with log_lock:
            logging.info(f"Replacing existing file: {output_path}")
    
    # Choose conversion method based on platform
    current_platform = platform.system()
    
    try:
        if current_platform == "Darwin":  # macOS
            success = convert_with_libreoffice(input_path, output_path)
        elif current_platform == "Windows":
            success = convert_with_comtypes(input_path, output_path)
        elif current_platform == "Linux":
            success = convert_with_libreoffice(input_path, output_path)
        else:
            return False, input_path, output_path, f"Unsupported platform: {current_platform}"
        
        if success:
            return True, input_path, output_path, f"Successfully converted: {input_path} → {output_path}"
        else:
            return False, input_path, output_path, f"Conversion failed: {input_path}"
            
    except Exception as e:
        return False, input_path, output_path, f"Error converting {input_path}: {str(e)}"

def convert_ppt_to_pptx(input_path, output_path=None):
    """
    Convert a single .ppt file to .pptx format using the appropriate method for the platform
    
    Args:
        input_path (str): Path to the input .ppt file
        output_path (str): Path for the output .pptx file (optional)
    
    Returns:
        bool: True if conversion successful, False otherwise
    """
    input_path = Path(input_path)
    
    if not input_path.exists():
        logging.error(f"Input file not found: {input_path}")
        return False
    
    if input_path.suffix.lower() != '.ppt':
        logging.error(f"Input file is not a .ppt file: {input_path}")
        return False
    
    # Generate output path if not provided
    if output_path is None:
        output_path = input_path.with_suffix('.pptx')
    else:
        output_path = Path(output_path)
    
    # Check if output file already exists
    if output_path.exists():
        logging.warning(f"Output file already exists: {output_path}")
        response = input(f"Overwrite {output_path}? (y/N): ").strip().lower()
        if response != 'y':
            logging.info("Skipping conversion")
            return False
    
    # Use the thread-safe conversion function
    success, _, _, message = convert_single_file(input_path, output_path, replace_existing=True)
    
    if success:
        logging.info(message)
    else:
        logging.error(message)
    
    return success

def convert_directory(directory_path, recursive=False, dry_run=False, max_workers=10, replace_existing=True):
    """
    Convert all .ppt files in a directory to .pptx format using parallel processing
    
    Args:
        directory_path (str): Path to the directory containing .ppt files
        recursive (bool): Whether to search subdirectories recursively
        dry_run (bool): If True, only show what would be converted without actually converting
        max_workers (int): Maximum number of parallel workers
        replace_existing (bool): Whether to replace existing .pptx files
    
    Returns:
        tuple: (successful_conversions, failed_conversions, skipped_files)
    """
    directory_path = Path(directory_path)
    
    if not directory_path.exists():
        logging.error(f"Directory not found: {directory_path}")
        return 0, 0, 0
    
    if not directory_path.is_dir():
        logging.error(f"Path is not a directory: {directory_path}")
        return 0, 0, 0
    
    # Find all .ppt files
    pattern = "**/*.ppt" if recursive else "*.ppt"
    ppt_files = list(directory_path.glob(pattern))
    
    if not ppt_files:
        logging.info(f"No .ppt files found in {directory_path}")
        return 0, 0, 0
    
    logging.info(f"Found {len(ppt_files)} .ppt file(s) to convert")
    
    # Prepare files for conversion
    files_to_convert = []
    skipped = 0
    
    for ppt_file in ppt_files:
        output_file = ppt_file.with_suffix('.pptx')
        
        # Skip existing files if replace_existing is False
        if output_file.exists() and not replace_existing:
            with log_lock:
                logging.info(f"Skipping {ppt_file} - .pptx version already exists")
            skipped += 1
            continue
        
        if dry_run:
            action = "replace" if output_file.exists() else "convert"
            with log_lock:
                logging.info(f"[DRY RUN] Would {action}: {ppt_file} → {output_file}")
            continue
        
        files_to_convert.append((ppt_file, output_file))
    
    if dry_run:
        return 0, 0, skipped
    
    if not files_to_convert:
        logging.info("No files to convert")
        return 0, 0, skipped
    
    logging.info(f"Converting {len(files_to_convert)} files using {max_workers} workers...")
    
    successful = 0
    failed = 0
    
    # Use ThreadPoolExecutor for parallel processing
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all conversion tasks
        future_to_file = {
            executor.submit(convert_single_file, input_path, output_path, replace_existing): (input_path, output_path)
            for input_path, output_path in files_to_convert
        }
        
        # Process completed tasks
        for future in as_completed(future_to_file):
            input_path, output_path = future_to_file[future]
            try:
                success, _, _, message = future.result()
                
                with log_lock:
                    if success:
                        logging.info(message)
                        successful += 1
                    else:
                        logging.error(message)
                        failed += 1
                        
            except Exception as e:
                with log_lock:
                    logging.error(f"Error processing {input_path}: {str(e)}")
                failed += 1
    
    return successful, failed, skipped

def check_dependencies():
    """
    Check if required dependencies are available for the current platform
    
    Returns:
        bool: True if dependencies are available, False otherwise
    """
    current_platform = platform.system()
    
    if current_platform == "Darwin" or current_platform == "Linux":  # macOS or Linux
        soffice_path = find_libreoffice()
        if not soffice_path:
            logging.error("LibreOffice not found!")
            if current_platform == "Darwin":
                logging.error("Install LibreOffice:")
                logging.error("1. Download from https://www.libreoffice.org/")
                logging.error("2. Or use Homebrew: brew install --cask libreoffice")
            else:
                logging.error("Install LibreOffice:")
                logging.error("1. Download from https://www.libreoffice.org/")
                logging.error("2. Or use package manager: sudo apt-get install libreoffice")
            return False
        else:
            logging.info(f"Found LibreOffice at: {soffice_path}")
            return True
    
    elif current_platform == "Windows":
        try:
            import comtypes.client
            logging.info("Found comtypes library for Windows PowerPoint conversion")
            return True
        except ImportError:
            logging.error("comtypes library not found!")
            logging.error("Install it with: pip install comtypes")
            return False
    
    else:
        logging.error(f"Unsupported platform: {current_platform}")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="Convert PowerPoint .ppt files to .pptx format (cross-platform)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s /path/to/presentations/          # Convert all .ppt files in directory (replace existing)
  %(prog)s /path/to/presentations/ -r      # Convert recursively in subdirectories
  %(prog)s /path/to/file.ppt               # Convert a single file
  %(prog)s /path/to/presentations/ --dry-run  # Show what would be converted
  %(prog)s /path/to/presentations/ -w 5    # Use 5 parallel workers
  %(prog)s /path/to/presentations/ --no-replace  # Skip existing .pptx files
  %(prog)s --check-deps                    # Check if dependencies are installed

Behavior:
  - By default, replaces existing .pptx files with fresh conversions
  - Use --no-replace to skip files that already have .pptx versions
  - Uses 10 parallel workers by default for directory conversion
  - Adjust with -w/--workers option based on your system resources

Platform Support:
  macOS/Linux: Uses LibreOffice (install from https://www.libreoffice.org/)
  Windows:     Uses Microsoft PowerPoint via comtypes (pip install comtypes)
        """
    )
    
    parser.add_argument(
        "path",
        nargs='?',
        help="Path to directory containing .ppt files or path to a single .ppt file"
    )
    
    parser.add_argument(
        "-r", "--recursive",
        action="store_true",
        help="Search subdirectories recursively"
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be converted without actually converting"
    )
    
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging"
    )
    
    parser.add_argument(
        "-o", "--output",
        help="Output path for single file conversion (only used when converting a single file)"
    )
    
    parser.add_argument(
        "--check-deps",
        action="store_true",
        help="Check if required dependencies are installed"
    )
    
    parser.add_argument(
        "-w", "--workers",
        type=int,
        default=10,
        help="Number of parallel workers for directory conversion (default: 10)"
    )
    
    parser.add_argument(
        "--no-replace",
        action="store_true",
        help="Skip files that already have .pptx versions instead of replacing them"
    )
    
    args = parser.parse_args()
    
    setup_logging(args.verbose)
    
    # Check dependencies if requested
    if args.check_deps:
        if check_dependencies():
            logging.info("All dependencies are available!")
            sys.exit(0)
        else:
            sys.exit(1)
    
    # Require path argument if not checking dependencies
    if not args.path:
        parser.error("Path argument is required unless using --check-deps")
    
    # Check dependencies before proceeding
    if not check_dependencies():
        sys.exit(1)
    
    path = Path(args.path)
    
    if not path.exists():
        logging.error(f"Path not found: {path}")
        sys.exit(1)
    
    if path.is_file():
        # Convert single file
        if path.suffix.lower() != '.ppt':
            logging.error("File must have .ppt extension")
            sys.exit(1)
        
        output_path = args.output if args.output else None
        
        if args.dry_run:
            output_display = output_path or path.with_suffix('.pptx')
            logging.info(f"[DRY RUN] Would convert: {path} → {output_display}")
        else:
            success = convert_ppt_to_pptx(path, output_path)
            sys.exit(0 if success else 1)
    
    elif path.is_dir():
        # Convert directory
        successful, failed, skipped = convert_directory(
            path,
            recursive=args.recursive,
            dry_run=args.dry_run,
            max_workers=args.workers,
            replace_existing=not args.no_replace
        )
        
        if not args.dry_run:
            logging.info(f"Conversion complete: {successful} successful, {failed} failed, {skipped} skipped")
        
        sys.exit(0 if failed == 0 else 1)
    
    else:
        logging.error(f"Invalid path: {path}")
        sys.exit(1)

if __name__ == "__main__":
    main()