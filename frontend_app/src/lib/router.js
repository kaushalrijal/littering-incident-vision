import { useEffect, useState } from 'react';

export const ROUTES = {
  '/': 'upload',
  '/videos': 'videos',
  '/incidents': 'incidents',
  '/live': 'webcam',
};

const PATH_FOR_TAB = Object.fromEntries(
  Object.entries(ROUTES).map(([path, tab]) => [tab, path])
);

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event('pushstate'));
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('pushstate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('pushstate', sync);
    };
  }, []);

  return path;
}

export function pathForTab(tab) {
  return PATH_FOR_TAB[tab] ?? '/';
}
