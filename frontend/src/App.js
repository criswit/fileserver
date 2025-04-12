import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, Drawer, AppBar, Toolbar, Typography, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import FileExplorer from './components/FileExplorer';
import MarkdownViewer from './components/MarkdownViewer';
import JsonViewer from './components/JsonViewer';
import Home from './components/Home';

const drawerWidth = 280;

function App() {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    // Close drawer on mobile after selecting a file
    if (window.innerWidth < 600) {
      setOpen(false);
    }
  };

  const renderFileViewer = () => {
    if (!selectedFile) return <Home />;
    
    const ext = selectedFile.name.toLowerCase().split('.').pop();
    
    // Pass both the file path and directory context to the viewers
    if (ext === 'md') {
      return <MarkdownViewer 
        filePath={selectedFile.name} 
        dir={selectedFile.dir} 
      />;
    } else if (ext === 'json') {
      return <JsonViewer 
        filePath={selectedFile.name} 
        dir={selectedFile.dir} 
      />;
    }
    
    return <Typography>Unsupported file type</Typography>;
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={() => setOpen(!open)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            Markdown & JSON Viewer
          </Typography>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <FileExplorer onFileSelect={handleFileSelect} />
        </Box>
      </Drawer>
      
      <Drawer
        variant="temporary"
        open={open}
        onClose={() => setOpen(false)}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <FileExplorer onFileSelect={handleFileSelect} />
        </Box>
      </Drawer>
      
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Routes>
          <Route path="/*" element={renderFileViewer()} />
        </Routes>
      </Box>
    </Box>
  );
}

export default App;
