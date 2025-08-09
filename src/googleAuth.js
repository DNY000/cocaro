import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';

export function useGoogleProfileLogin(onProfile) {
  return useGoogleLogin({
    flow: 'implicit',
    scope: 'openid profile email',
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const profile = await res.json();
        onProfile({
          uid: profile.sub,
          name: profile.name || profile.given_name || 'Người chơi',
          avatar: profile.picture || '',
          email: profile.email,
        });
      } catch (e) {
        console.error('Google profile fetch failed', e);
      }
    },
    onError: (err) => console.error('Google login failed', err),
  });
}

export function GoogleSignInButton({ onProfile, className = 'btn', text = 'Đăng nhập bằng Google' }) {
  const login = useGoogleProfileLogin(onProfile);
  return (
    <button className={className} onClick={() => login()}> {text} </button>
  );
}


