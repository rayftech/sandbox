import { ReactElement } from 'react';
import './App.css';
import { NavBar } from '@components/NavBar';
import { Route, Routes } from 'react-router-dom';
import ErrorPage from '@pages/ErrorPage';

function App(): ReactElement {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="*" element={<ErrorPage />} />
      </Routes>
      <h1>Home Page</h1>
      <p>Welcome to the home page</p>
    </>
  );
}

export default App;
