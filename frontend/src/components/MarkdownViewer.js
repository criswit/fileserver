import React, { useState, useEffect, memo } from 'react';
import { Box, Paper, Typography, CircularProgress, Alert } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import plantumlEncoder from 'plantuml-encoder';
import axios from 'axios';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'neutral',
  securityLevel: 'loose'
});

// Separate component for Mermaid diagrams
const MermaidDiagram = memo(({ value }) => {
  const [svgContent, setSvgContent] = useState('');
  const [renderError, setRenderError] = useState(null);
  
  useEffect(() => {
    const renderDiagram = async () => {
      try {
        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        
        // Render the diagram
        const { svg } = await mermaid.render(id, value);
        setSvgContent(svg);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setRenderError('Failed to render Mermaid diagram');
      }
    };
    
    renderDiagram();
  }, [value]);
  
  if (renderError) {
    return (
      <Alert severity="error" sx={{ my: 2 }}>
        {renderError}
        <pre>{value}</pre>
      </Alert>
    );
  }
  
  return svgContent ? (
    <Box sx={{ my: 2 }} dangerouslySetInnerHTML={{ __html: svgContent }} />
  ) : (
    <Box sx={{ my: 2, p: 2, bgcolor: '#f5f5f5' }}>
      <CircularProgress size={20} />
    </Box>
  );
});

// Separate component for PlantUML diagrams
const PlantUMLDiagram = memo(({ value }) => {
  try {
    // Encode diagram to URL
    const encoded = plantumlEncoder.encode(value);
    const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;
    
    return (
      <Box sx={{ my: 2, textAlign: 'center' }}>
        <img 
          src={url} 
          alt="PlantUML diagram" 
          style={{ maxWidth: '100%' }} 
        />
      </Box>
    );
  } catch (err) {
    return (
      <Alert severity="error" sx={{ my: 2 }}>
        Failed to render PlantUML diagram
        <pre>{value}</pre>
      </Alert>
    );
  }
});

function MarkdownViewer({ filePath, dir }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filePath) return;
    
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        // Use the directory context if provided, otherwise extract from path
        let fileDir = dir;
        let fileName = filePath;
        
        if (!fileDir) {
          // Fall back to the old method if dir is not provided
          const pathParts = filePath.split('/');
          fileName = pathParts.pop(); // Remove filename
          fileDir = pathParts.join('/'); // Directory context
        }
        
        console.log(`Fetching markdown content: file=${fileName}, dir=${fileDir}`);
        const response = await axios.get(`/api/content/${fileName}?dir=${fileDir}`);
        setContent(response.data);
      } catch (err) {
        console.error('Error fetching markdown content:', err);
        setError('Failed to load markdown content');
      } finally {
        setLoading(false);
      }
    };
    
    fetchContent();
  }, [filePath, dir]); // Added dir to the dependency array

  // Components for ReactMarkdown
  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const value = String(children).replace(/\n$/, '');
      
      if (!inline) {
        // Handle special code blocks
        if (match) {
          const language = match[1].toLowerCase();
          
          if (language === 'mermaid') {
            return <MermaidDiagram value={value} />;
          }
          
          if (language === 'plantuml') {
            return <PlantUMLDiagram value={value} />;
          }
          
          // Regular syntax highlighting for code
          return (
            <SyntaxHighlighter
              style={materialLight}
              language={language}
              PreTag="div"
              {...props}
            >
              {value}
            </SyntaxHighlighter>
          );
        }
      }
      
      // Inline code or code without specified language
      return inline ? (
        <code className={className} {...props}>
          {children}
        </code>
      ) : (
        <SyntaxHighlighter style={materialLight} language="text" PreTag="div" {...props}>
          {value}
        </SyntaxHighlighter>
      );
    },
    // Add custom styling for tables
    table({ node, ...props }) {
      return (
        <Box sx={{ overflowX: 'auto', my: 2 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }} {...props} />
        </Box>
      );
    },
    thead({ node, ...props }) {
      return <thead style={{ backgroundColor: '#f5f5f5' }} {...props} />;
    },
    th({ node, ...props }) {
      return (
        <th
          style={{
            padding: '12px',
            borderBottom: '2px solid #ddd',
            textAlign: 'left',
            fontWeight: 'bold',
          }}
          {...props}
        />
      );
    },
    td({ node, ...props }) {
      return (
        <td
          style={{
            padding: '12px',
            borderBottom: '1px solid #ddd',
          }}
          {...props}
        />
      );
    },
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
    <Paper sx={{ p: 3, maxWidth: '100%' }}>
      <Box sx={{ 
        '& img': { maxWidth: '100%' },
        '& a': { color: 'primary.main' },
        '& h1, & h2': { borderBottom: '1px solid #eaecef', pb: 1, mb: 2 }
      }}>
        <ReactMarkdown
          children={content}
          remarkPlugins={[remarkGfm]}
          components={components}
        />
      </Box>
    </Paper>
  );
}

export default MarkdownViewer;
