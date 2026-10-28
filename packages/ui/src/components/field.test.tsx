// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from './field';
import { Input } from './input';

afterEach(cleanup);

describe('Field', () => {
  it('associates the label with the control', () => {
    render(<Field label="Name"><Input /></Field>);
    expect(screen.getByLabelText('Name').tagName).toBe('INPUT');
  });

  it('keeps a child id and appends the help id to its aria-describedby', () => {
    render(
      <Field label="Name" help="Shown on invoices">
        <Input id="x" aria-describedby="y" />
      </Field>,
    );
    const input = screen.getByLabelText('Name');
    expect(input.id).toBe('x');
    const help = screen.getByText('Shown on invoices');
    expect(input.getAttribute('aria-describedby')).toBe(`y ${help.id}`);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('error sets aria-invalid, replaces help and is described', () => {
    render(
      <Field label="Name" help="Shown on invoices" error="Required field">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('Shown on invoices')).toBeNull();
    const err = screen.getByText('Required field').closest('p')!;
    expect(input.getAttribute('aria-describedby')).toBe(err.id);
  });

  it('required renders an sr-only "(required)"', () => {
    render(<Field label="Name" required><Input /></Field>);
    expect(screen.getByText('(required)').className).toContain('sr-only');
  });

  it('optional renders muted "(optional)"', () => {
    render(<Field label="Name" optional><Input /></Field>);
    expect(screen.getByText('(optional)')).toBeTruthy();
  });

  it('htmlFor points the label at a control inside a wrapper and leaves the wrapper alone', () => {
    render(
      <Field label="Price" htmlFor="price" help="Per month">
        <div data-testid="wrap"><Input id="price" /></div>
      </Field>,
    );
    expect(screen.getByLabelText('Price').tagName).toBe('INPUT');
    const wrap = screen.getByTestId('wrap');
    expect(wrap.id).toBe('');
    expect(wrap.getAttribute('aria-describedby')).toBeNull();
  });
})
