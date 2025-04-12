import React, { useState, useEffect } from 'react';
import { List, ListItem, ListItemIcon, ListItemText, Box, Typography, CircularProgress, Breadcrumbs, Link, Divider } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import HomeIcon from '@mui/icons-material/Home';
import axios from 'axios';

function FileExplorer({ onFileSelect }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentDir, setCurrentDir] = useState('');
  const [error, setError] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  // Initial load of files
  useEffect(() => {
    fetchFiles(currentDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDir]);

  const fetchFiles = async (dir) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`/api/files?dir=${dir}`);
      
      // Sort files: directories first, then files alphabetically
      const sortedFiles = sortFiles(response.data);
      setFiles(sortedFiles);
      
      // Update breadcrumbs
      updateBreadcrumbs(dir);
    } catch (err) {
      console.error('Error fetching files:', err);
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const sortFiles = (filesList) => {
    console.log("Sorting files:", filesList);
    
    return filesList.sort((a, b) => {
      // Directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      
      // Alphabetical sort by name
      return a.name.localeCompare(b.name);
    });
  };

  const updateBreadcrumbs = (dir) => {
    if (!dir) {
      setBreadcrumbs([{ name: 'Home', path: '' }]);
      return;
    }
    
    const parts = dir.split('/').filter(part => part !== '');
    const crumbs = [{ name: 'Home', path: '' }];
    
    let currentPath = '';
    parts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      crumbs.push({ name: part, path: currentPath });
    });
    
    setBreadcrumbs(crumbs);
  };

  const goToParentDirectory = () => {
    if (currentDir === '') return;
    
    const parts = currentDir.split('/').filter(part => part !== '');
    if (parts.length <= 1) {
      setCurrentDir('');
    } else {
      const parentDir = parts.slice(0, -1).join('/');
      setCurrentDir(parentDir);
    }
  };

  const navigateToFolder = (dir) => {
    setCurrentDir(dir);
  };

  const handleFileClick = (file) => {
    if (file.isDir) {
      // If it's a directory, navigate into it
      const newPath = currentDir 
        ? `${currentDir}/${file.name}` 
        : file.name;
      navigateToFolder(newPath);
    } else {
      // If it's a file, select it with the current directory context
      const fileWithContext = {
        ...file,
        dir: currentDir, // Add the current directory context
        fullPath: currentDir ? `${currentDir}/${file.path}` : file.path
      };
      onFileSelect(fileWithContext);
    }
  };

  const handleBreadcrumbClick = (path) => {
    navigateToFolder(path);
  };

  const renderFile = (file) => {
    return (
      <ListItem 
        button 
        key={file.path}
        onClick={() => handleFileClick(file)}
        sx={{ 
          py: 1,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          }
        }}
      >
        <ListItemIcon>
          {file.isDir ? <FolderIcon color="primary" /> : <DescriptionIcon color="action" />}
        </ListItemIcon>
        <ListItemText 
          primary={file.name} 
          secondary={file.isDir ? 'Directory' : file.path.split('.').pop().toUpperCase()}
        />
      </ListItem>
    );
  };

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Path breadcrumbs */}
      <Box sx={{ p: 1, borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }}>
        <Breadcrumbs maxItems={4} aria-label="directory breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <Link
              key={crumb.path}
              component="button"
              variant="body2"
              color={index === breadcrumbs.length - 1 ? 'text.primary' : 'inherit'}
              onClick={() => handleBreadcrumbClick(crumb.path)}
              sx={{ textDecoration: 'none' }}
            >
              {index === 0 ? <HomeIcon fontSize="small" sx={{ mr: 0.5 }} /> : null}
              {crumb.name}
            </Link>
          ))}
        </Breadcrumbs>
      </Box>
      
      {/* Parent directory button */}
      {currentDir !== '' && (
        <Box sx={{ p: 1 }}>
          <ListItem 
            button 
            onClick={goToParentDirectory}
            sx={{ 
              borderRadius: 1,
              border: '1px solid rgba(0, 0, 0, 0.12)',
              mb: 1
            }}
          >
            <ListItemIcon>
              <ArrowUpwardIcon />
            </ListItemIcon>
            <ListItemText primary="Parent Directory" />
          </ListItem>
          <Divider />
        </Box>
      )}
      
      {/* Files and folders list */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Typography color="error" sx={{ p: 2 }}>
          {error}
        </Typography>
      ) : (
        <List component="nav" sx={{ p: 0 }}>
          {files.map(file => renderFile(file))}
          {files.length === 0 && (
            <Typography sx={{ p: 2, color: 'text.secondary' }}>
              No markdown or JSON files found
            </Typography>
          )}
        </List>
      )}
    </Box>
  );
}

export default FileExplorer;
