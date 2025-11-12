// src/scripts/routes/routes.js
import { HomePage } from '../pages/home/home-page.js';
import { AboutPage } from '../pages/about-page.js';             // <— sesuai strukturmu
import { LoginPage } from '../pages/auth/login-page.js';
import { RegisterPage } from '../pages/auth/register-page.js';
import { AddStoryPage } from '../pages/add-story/add-story-page.js';

export function router() {
  const routes = {
    '/home': HomePage,
    '/about': AboutPage,
    '/login': LoginPage,
    '/register': RegisterPage,
    '/add-story': AddStoryPage,
  };

  const hash = location.hash.replace(/^#/, '') || '/home';
  const main = document.getElementById('main-content');
  main.innerHTML = '';

  const View = routes[hash] || HomePage;
  View().then?.(el => main.appendChild(el)) || main.appendChild(View());

  // view transition (opsional)
  if (document.startViewTransition) document.startViewTransition(() => {});
}