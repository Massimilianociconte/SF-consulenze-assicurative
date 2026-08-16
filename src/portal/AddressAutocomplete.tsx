import React, { useEffect, useId, useRef, useState } from 'react';
import { Database, LoaderCircle, MapPin, Search } from 'lucide-react';
import {
  api,
  ApiError,
  type AddressSearchResponse,
  type AddressSuggestion,
  type ReferenceDataset,
} from '../lib/api';

interface AddressAutocompleteProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  error,
  onChange,
  onSelect,
}) => {
  const inputId = useId();
  const listId = useId();
  const [interacted, setInteracted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [datasets, setDatasets] = useState<ReferenceDataset[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!interacted) return;
    const query = value.trim();
    const currentRequest = ++requestId.current;

    if (timer.current) window.clearTimeout(timer.current);
    if (query.length < 3) {
      setSuggestions([]);
      setDatasets([]);
      setSearched(false);
      setLoading(false);
      setOpen(false);
      return;
    }

    timer.current = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const result = await api.get<AddressSearchResponse>(
          `/api/reference/addresses?q=${encodeURIComponent(query)}&limit=8`,
        );
        if (requestId.current !== currentRequest) return;
        setSuggestions(result.suggestions);
        setDatasets(result.datasets);
        setSearched(true);
        setActiveIndex(result.suggestions.length > 0 ? 0 : -1);
        setOpen(true);
      } catch (err) {
        if (requestId.current !== currentRequest) return;
        setSuggestions([]);
        setDatasets([]);
        setSearched(true);
        setSearchError(
          err instanceof ApiError
            ? err.message
            : 'Suggerimenti non disponibili. Puoi continuare a compilare a mano.',
        );
        setOpen(true);
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    }, 300);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [interacted, value]);

  const choose = (suggestion: AddressSuggestion) => {
    onSelect(suggestion);
    setSuggestions([]);
    setOpen(false);
    setSearched(false);
    setInteracted(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const activeDataset = suggestions[0]
    ? datasetById.get(suggestions[0].datasetId)
    : datasets.find((dataset) => dataset.kind === 'address');
  const postalDataset = suggestions[0]?.postalDatasetId
    ? datasetById.get(suggestions[0].postalDatasetId)
    : datasets.find((dataset) => dataset.kind === 'municipality');

  return (
    <div className="mb-4 relative">
      <label htmlFor={inputId} className="block text-[0.8rem] font-bold text-[#0f172a] mb-1.5">
        Indirizzo di residenza
      </label>
      <div className="relative">
        <MapPin
          size={17}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none"
        />
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
          value={value}
          onFocus={() => {
            setInteracted(true);
            if (searched) setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setInteracted(true);
            onChange(event.target.value);
            setOpen(false);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          autoComplete="street-address"
          placeholder="Via, piazza e civico — es. Via Roma 12"
          className={`w-full rounded-xl border bg-white pl-11 pr-11 py-3 text-[0.95rem] text-[#0f172a] placeholder:text-[#94a3b8] ${
            error ? 'border-[#fca5a5] focus:border-[#ef4444]' : 'border-[rgba(15,23,42,0.12)] focus:border-[#c5a059]'
          }`}
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none">
          {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Search size={17} />}
        </span>
      </div>
      <p id={`${inputId}-hint`} className="mt-1.5 text-[0.75rem] text-[#64748b] leading-relaxed">
        Dopo 3 caratteri cerchiamo nei dati ufficiali disponibili. Puoi sempre scrivere o correggere tutto a mano.
      </p>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-[0.78rem] font-semibold text-[#b91c1c]">
          {error}
        </p>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Suggerimenti di indirizzo"
          className="absolute z-20 left-0 right-0 mt-2 overflow-hidden rounded-xl border border-[rgba(15,23,42,0.12)] bg-white shadow-xl"
        >
          {suggestions.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <li
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  key={suggestion.id}
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(suggestion)}
                    className={`w-full text-left px-4 py-3 border-b border-[rgba(15,23,42,0.06)] ${
                      activeIndex === index ? 'bg-[#f4f0ea]' : 'hover:bg-[#f8fafc]'
                    }`}
                  >
                    <span className="block text-[0.88rem] font-bold text-[#0f172a]">{suggestion.street}</span>
                    <span className="block text-[0.76rem] text-[#64748b] mt-0.5">
                      {[
                        suggestion.locality,
                        [suggestion.postalCode, suggestion.city].filter(Boolean).join(' '),
                        suggestion.province,
                        suggestion.country,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                      {suggestion.postalCode ? ' • CAP proposto da verificare' : ' • CAP da inserire'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3.5">
              <p className="text-[0.84rem] font-semibold text-[#334155]">
                {searchError ?? 'Nessun suggerimento nella copertura disponibile.'}
              </p>
              <p className="text-[0.76rem] text-[#64748b] mt-1">
                Continua pure a mano: il campo non viene bloccato.
              </p>
            </div>
          )}

          {activeDataset && (
            <div className="flex items-start gap-2 bg-[#f8fafc] px-4 py-2.5 text-[0.7rem] text-[#64748b] leading-relaxed">
              <Database size={13} className="shrink-0 mt-0.5" />
              <span>
                Strade e civici: {activeDataset.publisher}, ANNCSU {activeDataset.version}.
                {postalDataset && (
                  <> CAP di riferimento: {postalDataset.publisher}, IPA {postalDataset.version}.</>
                )}{' '}
                {activeDataset.coverage} ·{' '}
                <a
                  href={activeDataset.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline hover:text-[#0f172a]"
                >
                  CC BY 4.0
                </a>
                . Ogni proposta resta modificabile e va verificata.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
