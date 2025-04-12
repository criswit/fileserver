package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Configuration options
type Config struct {
	Port         string
	AllowedExts  []string
	StaticDir    string
	IgnoreHidden bool
	ReadOnly     bool
}

// FileInfo represents a file or directory in the system
type FileInfo struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Size     int64      `json:"size"`
	ModTime  time.Time  `json:"modTime"`
	Children []FileInfo `json:"children,omitempty"`
}

// Global configuration
var config Config

func main() {
	// Parse command line flags
	port := flag.String("port", "8080", "Port to run the server on")
	staticDir := flag.String("static", "./frontend/build", "Directory containing static files")
	readOnly := flag.Bool("readonly", true, "Run in read-only mode")
	flag.Parse()

	// Set up configuration
	config = Config{
		Port:         *port,
		AllowedExts:  []string{".md", ".json"},
		StaticDir:    *staticDir,
		IgnoreHidden: true,
		ReadOnly:     *readOnly,
	}

	// Print working directory and static files path for debugging
	cwd, _ := os.Getwd()
	absStaticDir, _ := filepath.Abs(*staticDir)
	log.Printf("Current working directory at startup: %s", cwd)
	log.Printf("Static files directory: %s (absolute: %s)", *staticDir, absStaticDir)

	// Set up middleware
	mux := http.NewServeMux()

	// Log requests
	loggingMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			next.ServeHTTP(w, r)
			log.Printf("%s %s %s", r.Method, r.RequestURI, time.Since(start))
		})
	}

	// Serve static files for the React frontend
	absStaticDir, _ = filepath.Abs(config.StaticDir)
	log.Printf("Serving static files from directory: %s", absStaticDir)
	fs := http.FileServer(http.Dir(absStaticDir))
	mux.Handle("/", fs)

	// API endpoints
	mux.HandleFunc("/api/files", listFiles)
	mux.HandleFunc("/api/content/", getFileContent)
	mux.HandleFunc("/api/query/", queryJSON)

	// Add CORS headers for development
	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// Create server with middleware
	handler := corsMiddleware(loggingMiddleware(mux))

	// Start server
	log.Printf("Starting server in %s mode", modeName())
	log.Printf("Server running on http://localhost:%s", config.Port)
	log.Fatal(http.ListenAndServe(":"+config.Port, handler))
}

func modeName() string {
	if config.ReadOnly {
		return "read-only"
	}
	return "read-write"
}

func listFiles(w http.ResponseWriter, r *http.Request) {
	requestedDir := r.URL.Query().Get("dir")
	var rootDir string
	var err error

	// Get the base directory (current working directory)
	baseDir, err := os.Getwd()
	if err != nil {
		log.Printf("Error getting current directory: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Handle directory path
	if requestedDir == "" || requestedDir == "." {
		rootDir = baseDir
	} else {
		// Check if path is absolute
		if filepath.IsAbs(requestedDir) {
			rootDir = requestedDir
		} else {
			// If it's relative, join with baseDir
			rootDir = filepath.Join(baseDir, requestedDir)
		}
	}

	log.Printf("Current working directory: %s", baseDir)
	log.Printf("Requested directory: %s", requestedDir)
	log.Printf("Listing files in directory: %s", rootDir)

	// Validate the directory exists
	fileInfo, err := os.Stat(rootDir)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Error: Directory not found: %s", rootDir)
			http.Error(w, fmt.Sprintf("Directory not found: %s", rootDir), http.StatusNotFound)
		} else {
			log.Printf("Error accessing directory: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if !fileInfo.IsDir() {
		log.Printf("Error: Not a directory: %s", rootDir)
		http.Error(w, fmt.Sprintf("Not a directory: %s", rootDir), http.StatusBadRequest)
		return
	}

	// For the requested directory, we want to directly scan its immediate children
	// rather than filtering based on child content
	var currentDirFiles []FileInfo

	// Read the immediate children of the requested directory
	entries, err := os.ReadDir(rootDir)
	if err != nil {
		log.Printf("Error reading directory: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Process each entry in the current directory
	for _, entry := range entries {
		entryName := entry.Name()
		entryPath := filepath.Join(rootDir, entryName)

		// Skip hidden files and directories if configured
		if config.IgnoreHidden && strings.HasPrefix(entryName, ".") {
			continue
		}

		// Skip node_modules and other build/dependency directories
		if entry.IsDir() && (entryName == "node_modules" ||
			strings.Contains(entryPath, "node_modules") ||
			entryName == "build" ||
			entryName == "dist") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			log.Printf("Error getting file info for %s: %v", entryPath, err)
			continue
		}

		// For regular files, only include those with allowed extensions
		if !entry.IsDir() {
			ext := strings.ToLower(filepath.Ext(entryName))
			isAllowedExt := false
			for _, allowedExt := range config.AllowedExts {
				if ext == allowedExt {
					isAllowedExt = true
					break
				}
			}

			if !isAllowedExt {
				continue
			}
		}

		// If it's a directory, check if it contains any markdown or JSON files
		// We'll just do a quick check rather than a full recursive scan
		if entry.IsDir() {
			hasRelevantFiles := false

			// Quick check for relevant files
			subEntries, err := os.ReadDir(entryPath)
			if err == nil {
				for _, subEntry := range subEntries {
					if !subEntry.IsDir() {
						ext := strings.ToLower(filepath.Ext(subEntry.Name()))
						for _, allowedExt := range config.AllowedExts {
							if ext == allowedExt {
								hasRelevantFiles = true
								break
							}
						}
						if hasRelevantFiles {
							break
						}
					}
				}
			}

			if !hasRelevantFiles {
				log.Printf("Skipping directory without relevant files: %s", entryPath)
				continue
			}
		}

		// Get relative path from the rootDir
		relPath, err := filepath.Rel(rootDir, entryPath)
		if err != nil {
			log.Printf("Error getting relative path for %s: %v", entryPath, err)
			continue
		}

		// Add this file/directory to the list
		fileInfo := FileInfo{
			Name:    entryName,
			Path:    relPath,
			IsDir:   entry.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		}

		log.Printf("Adding to list: %s (isDir: %v)", relPath, entry.IsDir())
		currentDirFiles = append(currentDirFiles, fileInfo)
	}

	// Sort the files: directories first, then alphabetically
	sort.Slice(currentDirFiles, func(i, j int) bool {
		// If one is a directory and one is not, the directory comes first
		if currentDirFiles[i].IsDir != currentDirFiles[j].IsDir {
			return currentDirFiles[i].IsDir
		}

		// Both are directories or both are files, sort by name
		return currentDirFiles[i].Name < currentDirFiles[j].Name
	})

	log.Printf("Found %d items in directory %s", len(currentDirFiles), rootDir)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	jsonData, err := json.Marshal(currentDirFiles)
	if err != nil {
		log.Printf("Error encoding JSON: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Sending response with %d bytes", len(jsonData))
	w.Write(jsonData)
}

func getFileContent(w http.ResponseWriter, r *http.Request) {
	requestedFile := strings.TrimPrefix(r.URL.Path, "/api/content/")
	requestedDir := r.URL.Query().Get("dir")

	log.Printf("Getting content for file: %s in directory: %s", requestedFile, requestedDir)

	// Get current working directory as base
	baseDir, err := os.Getwd()
	if err != nil {
		log.Printf("Error getting current directory: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Attempt multiple resolution strategies
	var filePaths []string

	// If directory parameter is provided, try that first with the filename
	if requestedDir != "" {
		// Create a full path by joining the current directory, the requested directory, and the file name
		filePaths = append(filePaths, filepath.Join(baseDir, requestedDir, requestedFile))
	}

	// Then try the standard resolution approaches
	// 1. Check if the path could be a direct path from current working directory
	filePaths = append(filePaths, filepath.Join(baseDir, requestedFile))

	// 2. Check if the PARENT directory of the file is part of the path
	// For example, if request is for "package.json" while in "frontend" directory
	if !strings.Contains(requestedFile, "/") {
		// First, get all directories
		entries, err := os.ReadDir(baseDir)
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					subDirPath := filepath.Join(baseDir, entry.Name(), requestedFile)
					filePaths = append(filePaths, subDirPath)
				}
			}
		}
	}

	// Try each possible path
	var resolvedPath string
	for _, path := range filePaths {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			resolvedPath = path
			break
		}
	}

	// If no matching paths were found and the path has multiple segments
	// Try direct match against full path
	if resolvedPath == "" && strings.Contains(requestedFile, "/") {
		fullPath := filepath.Join(baseDir, requestedFile)
		info, err := os.Stat(fullPath)
		if err == nil && !info.IsDir() {
			resolvedPath = fullPath
		}
	}

	// If no path was resolved, error out
	if resolvedPath == "" {
		log.Printf("Error: Could not resolve file: %s", requestedFile)
		log.Printf("Attempted paths: %v", filePaths)
		http.Error(w, fmt.Sprintf("File not found: %s", requestedFile), http.StatusNotFound)
		return
	}

	filePath := resolvedPath
	log.Printf("Resolved absolute file path: %s", filePath)

	// Basic security check - prevent directory traversal attacks
	if strings.Contains(filePath, "..") {
		log.Printf("Security error: path contains prohibited '..' sequence: %s", filePath)
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// Check file exists
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Error: File not found: %s", filePath)
			http.Error(w, fmt.Sprintf("File not found: %s", filePath), http.StatusNotFound)
		} else {
			log.Printf("Error accessing file: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Ensure it's a file, not a directory
	if fileInfo.IsDir() {
		log.Printf("Error: Cannot display directory content: %s", filePath)
		http.Error(w, "Cannot display directory content", http.StatusBadRequest)
		return
	}

	// Check file extension
	ext := strings.ToLower(filepath.Ext(filePath))
	isAllowedExt := false
	for _, allowedExt := range config.AllowedExts {
		if ext == allowedExt {
			isAllowedExt = true
			break
		}
	}

	if !isAllowedExt {
		log.Printf("Error: Unsupported file type: %s", ext)
		http.Error(w, fmt.Sprintf("Unsupported file type: %s", ext), http.StatusBadRequest)
		return
	}

	// Read the file
	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Printf("Error reading file: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Set appropriate content type
	if ext == ".json" {
		w.Header().Set("Content-Type", "application/json")
	} else if ext == ".md" {
		w.Header().Set("Content-Type", "text/plain")
	}

	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")

	log.Printf("Sending file content, size: %d bytes", len(data))
	w.Write(data)
}

func queryJSON(w http.ResponseWriter, r *http.Request) {
	requestedFile := r.URL.Query().Get("file")
	jsonPath := r.URL.Query().Get("path")
	requestedDir := r.URL.Query().Get("dir")

	log.Printf("Querying JSON file: %s with path: %s in directory: %s", requestedFile, jsonPath, requestedDir)

	if requestedFile == "" || jsonPath == "" {
		log.Printf("Error: Missing file or path parameter")
		http.Error(w, "Missing file or path parameter", http.StatusBadRequest)
		return
	}

	// Get current working directory as base
	baseDir, err := os.Getwd()
	if err != nil {
		log.Printf("Error getting current directory: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Attempt multiple resolution strategies
	var filePaths []string

	// If directory parameter is provided, try that first with the filename
	if requestedDir != "" {
		// Create a full path by joining the current directory, the requested directory, and the file name
		filePaths = append(filePaths, filepath.Join(baseDir, requestedDir, requestedFile))
	}

	// Then try the standard resolution approaches
	// 1. Check if the path could be a direct path from current working directory
	filePaths = append(filePaths, filepath.Join(baseDir, requestedFile))

	// 2. Check if the PARENT directory of the file is part of the path
	// For example, if request is for "package.json" while in "frontend" directory
	if !strings.Contains(requestedFile, "/") {
		// First, get all directories
		entries, err := os.ReadDir(baseDir)
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					subDirPath := filepath.Join(baseDir, entry.Name(), requestedFile)
					filePaths = append(filePaths, subDirPath)
				}
			}
		}
	}

	// Try each possible path
	var resolvedPath string
	for _, path := range filePaths {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			resolvedPath = path
			break
		}
	}

	// If no matching paths were found and the path has multiple segments
	// Try direct match against full path
	if resolvedPath == "" && strings.Contains(requestedFile, "/") {
		fullPath := filepath.Join(baseDir, requestedFile)
		info, err := os.Stat(fullPath)
		if err == nil && !info.IsDir() {
			resolvedPath = fullPath
		}
	}

	// If no path was resolved, error out
	if resolvedPath == "" {
		log.Printf("Error: Could not resolve file: %s", requestedFile)
		log.Printf("Attempted paths: %v", filePaths)
		http.Error(w, fmt.Sprintf("File not found: %s", requestedFile), http.StatusNotFound)
		return
	}

	filePath := resolvedPath
	log.Printf("Resolved absolute JSON file path: %s", filePath)

	// Basic security check
	if strings.Contains(filePath, "..") {
		log.Printf("Security error: path contains prohibited '..' sequence: %s", filePath)
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	// Check file exists and is a JSON file
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Error: File not found: %s", filePath)
			http.Error(w, fmt.Sprintf("File not found: %s", filePath), http.StatusNotFound)
		} else {
			log.Printf("Error accessing file: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if fileInfo.IsDir() {
		log.Printf("Error: Cannot query directory: %s", filePath)
		http.Error(w, "Cannot query directory", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if ext != ".json" {
		log.Printf("Error: File is not JSON: %s (ext: %s)", filePath, ext)
		http.Error(w, "File is not JSON", http.StatusBadRequest)
		return
	}

	// Read and parse the JSON file
	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Printf("Error reading file: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var jsonData interface{}
	err = json.Unmarshal(data, &jsonData)
	if err != nil {
		log.Printf("Error parsing JSON: %v", err)
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Handle array indexing in the query
	arrayIndexRegex := regexp.MustCompile(`(.*)\[(\d+)\](.*)`)

	// Process the JSON path components
	parts := strings.Split(jsonPath, ".")
	result := jsonData

	for _, part := range parts {
		// Check if this part contains an array index
		arrayMatches := arrayIndexRegex.FindStringSubmatch(part)

		if len(arrayMatches) > 0 {
			// It's an array access
			objKey := arrayMatches[1]   // Part before [index]
			idxStr := arrayMatches[2]   // The index number
			restPath := arrayMatches[3] // Anything after [index]

			log.Printf("Processing array access: key=%s, index=%s, rest=%s", objKey, idxStr, restPath)

			// First get the object containing the array
			if objKey != "" {
				if m, ok := result.(map[string]interface{}); ok {
					result = m[objKey]
				} else {
					log.Printf("Error: Cannot access property '%s' - not an object", objKey)
					http.Error(w, fmt.Sprintf("Cannot access property '%s' - not an object", objKey), http.StatusBadRequest)
					return
				}
			}

			// Then access the array element
			if arr, ok := result.([]interface{}); ok {
				idx := 0
				fmt.Sscanf(idxStr, "%d", &idx)

				if idx >= 0 && idx < len(arr) {
					result = arr[idx]
				} else {
					log.Printf("Error: Array index out of bounds: %d (array length: %d)", idx, len(arr))
					http.Error(w, fmt.Sprintf("Array index out of bounds: %d", idx), http.StatusBadRequest)
					return
				}
			} else {
				log.Printf("Error: Cannot index - not an array, type is %T", result)
				http.Error(w, "Cannot index - not an array", http.StatusBadRequest)
				return
			}

			// Handle any remainder of the path (currently not supported in this simple implementation)
			if restPath != "" {
				log.Printf("Error: Complex array paths not supported: %s", restPath)
				http.Error(w, "Complex array paths not supported", http.StatusBadRequest)
				return
			}
		} else {
			// Regular object property access
			if m, ok := result.(map[string]interface{}); ok {
				result = m[part]
				log.Printf("Accessed property '%s'", part)
			} else {
				log.Printf("Error: Cannot access property '%s' - not an object, type is %T", part, result)
				http.Error(w, fmt.Sprintf("Cannot access property '%s' - not an object", part), http.StatusBadRequest)
				return
			}
		}
	}

	// Return the result
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	jsonResult, err := json.Marshal(result)
	if err != nil {
		log.Printf("Error encoding result to JSON: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Query successful, sending result (%d bytes)", len(jsonResult))
	w.Write(jsonResult)
}
