/**
 * P1 Recommendation #8: Search functionality across all chats
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { EnhancedChatMessage, SearchQuery, SearchResult, PlatformId } from '../types';
import { SEARCH_DEBOUNCE_MS } from '../constants/config';
import { getMessageAuthor } from '../utils/helpers';

export function useSearch(messages: Map<string, EnhancedChatMessage[]>) {
  const [query, setQuery] = useState<SearchQuery>({ text: '' });
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback((searchQuery: SearchQuery) => {
    if (!searchQuery.text.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const searchText = searchQuery.text.toLowerCase();
    const found: SearchResult[] = [];

    messages.forEach((msgs, sourceId) => {
      for (const message of msgs) {
        // Filter by platform if specified
        if (searchQuery.platforms?.length && !searchQuery.platforms.includes(message.platform as PlatformId)) {
          continue;
        }

        // Filter by user if specified
        const author = getMessageAuthor(message).toLowerCase();
        if (searchQuery.users?.length && !searchQuery.users.includes(author)) {
          continue;
        }

        // Filter by date range if specified
        if (searchQuery.dateRange) {
          const msgDate = new Date(message.timestamp);
          if (msgDate < searchQuery.dateRange.start || msgDate > searchQuery.dateRange.end) {
            continue;
          }
        }

        // Text search
        const messageText = message.message.toLowerCase();
        const authorText = author;

        if (messageText.includes(searchText) || authorText.includes(searchText)) {
          // Find the matched text for highlighting
          const matchIndex = messageText.indexOf(searchText);
          const matchedText = matchIndex >= 0 
            ? message.message.substring(Math.max(0, matchIndex - 20), Math.min(message.message.length, matchIndex + searchText.length + 20))
            : message.message.substring(0, 50);

          found.push({
            message,
            sourceId,
            matchedText,
            timestamp: new Date(message.timestamp),
          });
        }
      }
    });

    // Sort by timestamp, most recent first
    found.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Limit results
    setResults(found.slice(0, 100));
    setIsSearching(false);
  }, [messages]);

  const search = useCallback((text: string) => {
    const newQuery = { ...query, text };
    setQuery(newQuery);
    
    // Clear any pending debounce before scheduling a new one
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      performSearch(newQuery);
    }, SEARCH_DEBOUNCE_MS);
  }, [query, performSearch]);

  // Clean up the debounce timer when the hook unmounts
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const clearSearch = useCallback(() => {
    setQuery({ text: '' });
    setResults([]);
  }, []);

  const setFilters = useCallback((filters: Partial<SearchQuery>) => {
    const newQuery = { ...query, ...filters };
    setQuery(newQuery);
    performSearch(newQuery);
  }, [query, performSearch]);

  return {
    query,
    results,
    isSearching,
    search,
    clearSearch,
    setFilters,
  };
}
