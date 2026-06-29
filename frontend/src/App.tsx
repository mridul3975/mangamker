import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useCharacterVaultStore, usePanelGeneratorStore } from './store'
import './App.css'

function App() {
  const [name, setName] = useState('adam')
  const [role, setRole] = useState<'mc' | 'fmc' | 'side'>('mc')
  const [rawTraits, setRawTraits] = useState(
    '20-year-old Korean male, sharp jawline, messy black hair, dark blue hoodie, modern webtoon style'
  )

  const {
    characters,
    loading: characterLoading,
    error: characterError,
    load,
    add,
    refine,
  } = useCharacterVaultStore()

  const {
    rawStoryInput,
    panel,
    loading: panelLoading,
    error: panelError,
    setRawStoryInput,
    generate,
  } = usePanelGeneratorStore()

  useEffect(() => {
    void load()
  }, [load])

  const onCreateCharacter = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await add({ name, role, rawTraits })
  }

  const onGeneratePanel = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await generate()
  }

  return (
    <main className="app-shell">
      <header className="headline">
        <h1>MangaMaker Workflow</h1>
        <p>
          Character Studio creates locked descriptors, then Story Panel resolves <strong>@tags</strong> and generates a refined manhwa panel prompt.
        </p>
      </header>

      <section className="grid">
        <article className="card">
          <h2>Step 1: Character Studio</h2>
          <form onSubmit={onCreateCharacter} className="stack">
            <label>
              Name (@tag)
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="adam" />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value as 'mc' | 'fmc' | 'side')}>
                <option value="mc">MC</option>
                <option value="fmc">FMC</option>
                <option value="side">Side</option>
              </select>
            </label>
            <label>
              Raw traits
              <textarea value={rawTraits} onChange={(e) => setRawTraits(e.target.value)} rows={5} />
            </label>
            <button type="submit" disabled={characterLoading}>Save + Refine</button>
          </form>

          {characterError ? <p className="error">{characterError}</p> : null}

          <div className="stack">
            {characters.map((character) => (
              <div key={character.id} className="row">
                <div>
                  <p className="tag">@{character.name}</p>
                  <small>{character.role.toUpperCase()}</small>
                  <p>{character.refinedTraits}</p>
                </div>
                <button onClick={() => void refine(character.id)} disabled={characterLoading}>
                  Re-Refine
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Step 2: Story Panel</h2>
          <form onSubmit={onGeneratePanel} className="stack">
            <label>
              Raw story line
              <textarea
                value={rawStoryInput}
                onChange={(e) => setRawStoryInput(e.target.value)}
                rows={5}
                placeholder="@adam looks shocked as he opens the glowing artifact in his dark bedroom."
              />
            </label>
            <button type="submit" disabled={panelLoading}>Refine + Generate</button>
          </form>

          {panelError ? <p className="error">{panelError}</p> : null}

          {panel ? (
            <div className="stack">
              <p><strong>Status:</strong> {panel.status}</p>
              <p><strong>Merged prompt:</strong> {panel.mergedPrompt || '(pending)'}</p>
              <p><strong>Refined prompt:</strong> {panel.refinedPrompt || '(pending)'}</p>
              {panel.generatedImageUrl ? (
                <img src={panel.generatedImageUrl} alt="Generated manhwa panel" className="preview" />
              ) : null}
            </div>
          ) : null}
        </article>
      </section>
    </main>
  )
}

export default App
