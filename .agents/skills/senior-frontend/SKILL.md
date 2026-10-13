---
name: senior-frontend
description: "Comprehensive frontend development skill for building modern, performant web applications using ReactJS, NextJS, TypeScript, Tailwind CSS. Includes component scaffolding, performance optimization, bundle analysis, and UI best practices. Use when developing frontend features, optimizing performance, implementing UI/UX designs, managing state, or reviewing frontend code."
---

# Senior Frontend

Complete toolkit for senior frontend engineering with modern tools and best practices.

## Core Capabilities

1. Component Architecture & Scaffolding
2. Performance Optimization & Bundle Analysis
3. State Management (Zustand, React Query, Context)
4. Accessibility & Responsive UX

## Best Practices Summary

### Code Quality
- Follow established component patterns: Functional Components, Custom Hooks, clean separation of concern.
- Consistent naming: PascalCase for components, camelCase for functions/hooks, UPPER_SNAKE_CASE for constants.
- Avoid prop drilling with proper state management stores.

### Performance
- Lazy load heavy modules and pages with `React.lazy` and `Suspense`.
- Avoid unnecessary re-renders using memoization (`useMemo`, `useCallback`) when passing functions to large lists.
- Optimize images and SVG vectors.

### Interaction & Feedback
- Visible focus states on interactive elements.
- Loading states with spinners or skeleton screens.
- Optimistic UI updates with rollback on errors.
- Stable transitions (150ms-300ms) without layout shift.
