import { BlockingOverlayHost, ToastHost } from '@codaa/ui';
import { ComponentCatalogPage } from '../catalog/useCases/browse-components/ComponentCatalogPage';
import styles from './App.module.css';
export function App() { return <><ComponentCatalogPage /><div className={styles.toasts}><ToastHost /></div><BlockingOverlayHost /></>; }
