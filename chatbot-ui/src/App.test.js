import { render, screen } from '@testing-library/react';
import App from './App';

test('renders chat input', () => {
  render(<App />);
  expect(screen.getByPlaceholderText(/type your message/i)).toBeInTheDocument();
});
