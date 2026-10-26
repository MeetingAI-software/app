import React, { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthForm from './AuthForm';
import { Header } from './Header';
import { LandingPageClient } from './LandingPageClient';

// Exercise the actual event handlers without running browser effects or child components.
const { setState } = vi.hoisted(() => ({ setState: vi.fn() }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (value: unknown) => [value, setState],
  useEffect: () => {},
  useRef: () => ({ current: null }),
}));
vi.mock('@/lib/launch', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/launch')>(),
  LAUNCH_PAUSED: true,
}));

type ElementProps = {
  children?: ReactNode;
  href?: string;
  onClick?: (event: unknown) => void;
  onSubmit?: (event: unknown) => void;
};

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

const formProps = {
  title: 'Sign in', subtitle: '', cta: 'Sign In', loading: false, error: null,
  email: 'existing@example.com', password: 'test-password',
  onEmail: vi.fn(), onPassword: vi.fn(), legalPublished: false, footer: null,
};

describe('existing account access during the launch pause', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits password login instead of showing the launch dialog', () => {
    const onSubmit = vi.fn();
    const tree = elements(AuthForm({ ...formProps, mode: 'login', onSubmit }));
    const event = { preventDefault: vi.fn() };
    tree.find((element) => element.type === 'form')!.props.onSubmit!(event);
    expect(onSubmit).toHaveBeenCalledWith(event);
    expect(setState).not.toHaveBeenCalled();
  });

  it('allows the Google login link to navigate', () => {
    const tree = elements(AuthForm({ ...formProps, mode: 'login', onSubmit: vi.fn() }));
    const google = tree.find((element) => element.props.href?.endsWith('/api/auth/google'));
    expect(google).toBeDefined();
    const event = { preventDefault: vi.fn() };
    google!.props.onClick?.(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it('still blocks signup and hides Google signup', () => {
    const onSubmit = vi.fn();
    const tree = elements(AuthForm({ ...formProps, mode: 'signup', onSubmit }));
    const event = { preventDefault: vi.fn() };
    tree.find((element) => element.type === 'form')!.props.onSubmit!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith(true);
    expect(tree.some((element) => element.props.href?.endsWith('/api/auth/google'))).toBe(false);
  });

  it.each([
    ['shared header', () => Header()],
    ['landing page', () => LandingPageClient({ legalPublished: false })],
  ] as const)('allows Sign In from the %s while keeping Get Started paused', (_name, render) => {
    const links = elements(render()).filter((element) => element.props.href === '/meetings');
    expect(links).toHaveLength(2);
    const signInEvent = { preventDefault: vi.fn() };
    links[0].props.onClick?.(signInEvent);
    expect(signInEvent.preventDefault).not.toHaveBeenCalled();
    const getStartedEvent = { preventDefault: vi.fn() };
    links[1].props.onClick?.(getStartedEvent);
    expect(getStartedEvent.preventDefault).toHaveBeenCalled();
  });
});
