// @inikitty:inject:imports

const projectName = '{{projectName}}';

function App() {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  return (
    // @inikitty:inject:routes-open
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>{projectName}</h1>
      <p>
        This is the generated app frontend. It talks to the API at <code>{apiUrl}</code>.
      </p>
      {/* @inikitty:inject:home-links */}
    </main>
    // @inikitty:inject:routes-close
  );
}

export default App;
