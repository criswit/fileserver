import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import DataObjectIcon from '@mui/icons-material/DataObject';

function Home() {
  return (
    <Paper 
      elevation={2} 
      sx={{ 
        p: 4, 
        textAlign: 'center',
        maxWidth: '800px',
        mx: 'auto',
        mt: 4
      }}
    >
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome to Markdown & JSON Viewer
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Select a file from the sidebar to get started
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
        <Box sx={{ textAlign: 'center', maxWidth: '250px' }}>
          <DescriptionIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Markdown Files
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View Markdown files with support for tables, PlantUML diagrams, Mermaid diagrams, and code syntax highlighting.
          </Typography>
        </Box>
        
        <Box sx={{ textAlign: 'center', maxWidth: '250px' }}>
          <DataObjectIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            JSON Files
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Browse JSON files with syntax highlighting, collapsible nodes, and JSONPath query support.
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default Home;