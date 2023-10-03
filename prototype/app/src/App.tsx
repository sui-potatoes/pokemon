import { useState } from 'react'
import './App.css'
import { Game } from './components/game/Game'
import { Register } from './components/Register'
import { ActionBar } from './components/ActionBar';

function App() {

  const [email, setEmail] = useState<string>(localStorage.getItem('email') || '');
  const [connected, setConnected] = useState<boolean>(!!localStorage.getItem('email'));

  const login = () => {
    localStorage.setItem('email', email);
    setConnected(true);
  }

  const logout = () => {
    localStorage.setItem('email', '');
    setEmail('');
    setConnected(false);
  }

  return (
    <>
      <div className="h-[300px] items-center justify-center">

        <div className="pb-3 text-2xl tracking-widest font-medium">
          Welcome to Capy Arcade.
        </div>

        {connected && <ActionBar email={email} logout={logout} /> }

        <div className="container">
          {!connected && <Register email={email} setEmail={setEmail} login={login} />}
          {connected && <Game />}
        </div>

      </div>
    </>
  )
}

export default App
