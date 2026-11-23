import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app.tsx';
import {Boundary} from './lib.tsx';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><App/></Boundary></React.StrictMode>);
