import React from 'react';
import ReactDOM from 'react-dom/client';
import '@src/index.css';
import RoomsApp from '@src/RoomsApp';
import reportWebVitals from '@src/reportWebVitals';
import { GoogleOAuthProvider } from '@react-oauth/google';

const root = ReactDOM.createRoot(document.getElementById('root'));
const clientId = '634125290496-ptbkhdj2pj6hjf8bqhe3as02goai2isu.apps.googleusercontent.com';
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <RoomsApp />
    </GoogleOAuthProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
