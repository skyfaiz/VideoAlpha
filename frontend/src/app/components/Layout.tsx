import React, { useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar, MobileBottomNav } from './Sidebar';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { SettingsPanel } from './SettingsPanel';

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className="flex flex-col w-full h-[100dvh] overflow-hidden"
      style={{ background: '#0F172A', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      {/* Header */}
      <Header onSettingsOpen={() => setSettingsOpen(true)} />

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop Sidebar */}
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

      {/* Desktop Status Bar */}
      <div className="hidden md:block">
        <StatusBar />
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav onSettingsOpen={() => setSettingsOpen(true)} />

      {/* Settings Panel (global overlay) */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
