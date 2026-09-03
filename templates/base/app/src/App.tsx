const projectName = '{{projectName}}';

function App() {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>{projectName}</h1>
      <p>
        This is the generated app frontend. It talks to the API at <code>{apiUrl}</code>.
      </p>
    </main>
  );
}

export default App;
