import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { LtxPage } from './pages/LtxPage';
import { MinimaxPage } from './pages/MinimaxPage';
import { VoicesPage } from './pages/VoicesPage';
import { JobsPage } from './pages/JobsPage';
import { ArchitecturePage } from './pages/ArchitecturePage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'workflow', Component: WorkflowPage },
      { path: 'ltx', Component: LtxPage },
      { path: 'minimax', Component: MinimaxPage },
      { path: 'voices', Component: VoicesPage },
      { path: 'jobs', Component: JobsPage },
      { path: 'architecture', Component: ArchitecturePage },
    ],
  },
]);
