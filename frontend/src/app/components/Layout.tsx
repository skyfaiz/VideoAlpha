import React, { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { SettingsPanel } from './SettingsPanel';

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className="flex flex-col w-full h-screen overflow-hidden"
      style={{ background: '#0F172A', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      {/* Header */}
      <Header onCreateClick={() => {}} />

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(s => !s)}
          onSettingsOpen={() => setSettingsOpen(true)}
        />

        {/* Main content */}
        <main
          className="flex-1 min-w-0 overflow-hidden relative"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.08) transparent',
          }}
        >
          <Outlet />
        </main>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Settings Panel (global overlay) */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}