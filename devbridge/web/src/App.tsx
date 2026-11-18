import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AgentProvider } from './lib/agent';
import { Layout } from './components/Layout';
import Overview from './pages/Overview';
import Builder from './pages/Builder';
import Projects from './pages/Projects';
import Terminal from './pages/Terminal';
import Preview from './pages/Preview';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AgentProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="builder" element={<Builder />} />
            <Route path="projects" element={<Projects />} />
            <Route path="terminal" element={<Terminal />} />
            <Route path="preview" element={<Preview />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AgentProvider>
  );
}
