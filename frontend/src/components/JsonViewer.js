import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, CircularProgress, Alert, TextField, Button, Divider } from '@mui/material';
import { styled } from '@mui/material/styles';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Styled components
const QueryBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  backgroundColor: theme.palette.background.default,
  borderRadius: theme.shape.borderRadius,
}));

const ResultBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  position: 'relative',
}));

function JsonViewer({ filePath }) {
  const [content, setContent] = useState('');
  // Using parsedContent state variable for potential future features
  const [, setParsedContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [jsonPath, setJsonPath] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState(null);

  useEffect(() => {
    if (!filePath) return;
    
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        // Extract directory part from the path
        const pathParts = filePath.split('/');
        const fileName = pathParts.pop(); // Remove filename
        const dir = pathParts.join('/'); // Directory context
        
        const response = await axios.get(`/api/content/${fileName}?dir=${dir}`);
        
        // Format JSON for display
        const jsonData = typeof response.data === 'string' 
          ? JSON.parse(response.data) 
          : response.data;
        
        setParsedContent(jsonData);
        setContent(JSON.stringify(jsonData, null, 2));
      } catch (err) {
        console.error('Error fetching JSON content:', err);
        setError('Failed to load or parse JSON content');
      } finally {
        setLoading(false);
      }
    };
    
    fetchContent();
  }, [filePath]);

  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    if (!jsonPath.trim()) return;
    
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);
    
    try {
      // Extract directory part from the path
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop(); // Remove filename
      const dir = pathParts.join('/'); // Directory context
      
      const response = await axios.get(`/api/query/?file=${fileName}&path=${jsonPath}&dir=${dir}`);
      setQueryResult(response.data);
    } catch (err) {
      console.error('JSON query error:', err);
      setQueryError(err.response?.data || 'Failed to execute JSON path query');
    } finally {
      setQueryLoading(false);
    }
  };

  const renderJsonContent = () => {
    // If there's a query result, show that instead
    const displayContent = queryResult !== null 
      ? JSON.stringify(queryResult, null, 2) 
      : content;
    
    return (
      <SyntaxHighlighter
        language="json"
        style={materialLight}
        wrapLongLines={true}
        customStyle={{ fontSize: '14px' }}
      >
        {displayContent}
      </SyntaxHighlighter>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!filePath) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No file selected
        </Typography>
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 0, overflow: 'hidden' }}>
      <QueryBox component="form" onSubmit={handleQuerySubmit}>
        <Typography variant="subtitle1" gutterBottom>
          JSONPath Query
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            value={jsonPath}
            onChange={(e) => setJsonPath(e.target.value)}
            placeholder="Enter JSONPath (e.g. data.items)"
            variant="outlined"
          />
          <Button 
            type="submit" 
            variant="contained" 
            disabled={queryLoading}
            sx={{ minWidth: '100px' }}
          >
            {queryLoading ? 'Querying...' : 'Query'}
          </Button>
        </Box>
        {queryError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {queryError}
          </Alert>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Example: "user.address" to access nested properties.
        </Typography>
      </QueryBox>
      
      <Divider />
      
      <ResultBox>
        {queryResult !== null && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="primary">
              Query Results:
            </Typography>
          </Box>
        )}
        {renderJsonContent()}
      </ResultBox>
    </Paper>
  );
}

export default JsonViewer;