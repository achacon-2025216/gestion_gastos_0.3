import { Component, AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, ElementRef, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth';

declare var google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements AfterViewInit, OnInit {
  private authService: AuthService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private googleInitialized = false;

  logoSrc: string = 'assets/logo.png'; 
  sessionExpired: boolean = false;
  username: string = '';
  password: string = '';
  errorMessage: string = '';

  @ViewChild('googleBtn', { static: false }) googleBtn!: ElementRef;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['expired'] === '1') {
        this.sessionExpired = true;
        this.errorMessage = '';
      }
    });
  }

  ngAfterViewInit(): void {
    const script = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    const onLoad = () => this.initGoogleSignIn();
    script?.addEventListener('load', onLoad, { once: true });
    this.destroyRef.onDestroy(() => script?.removeEventListener('load', onLoad));
    this.initGoogleSignIn();
  }

  initGoogleSignIn(): void {
    if (!this.googleInitialized && typeof google !== 'undefined' && google.accounts?.id) {
      google.accounts.id.initialize({
        client_id: '463867676917-g8hga9ugqt9um24hpkoakrhlrt7jjhbs.apps.googleusercontent.com',
        callback: (response: any) => this.handleGoogleCredentialResponse(response)
      });

      if (this.googleBtn && this.googleBtn.nativeElement) {
        google.accounts.id.renderButton(
          this.googleBtn.nativeElement,
          { 
            theme: 'outline', 
            size: 'large', 
            shape: 'pill'
            // Nota: Se removió 'width: 100%' para evitar el bloqueo del SDK de Google
          }
        );
        this.googleInitialized = true;
      }
    }
  }

  handleGoogleCredentialResponse(response: any): void {
    try {
      const googleToken = response.credential;
      console.log('Token de Google capturado correctamente. Enviando al backend...');

      // Petición al backend en Node.js para generar el token interno limitado a 2 minutos
      this.authService.loginWithGoogle(googleToken).subscribe({
        next: (res) => {
          if (res && res.token) {
            console.log('¡ÉXITO! Token de 2 minutos aplicado correctamente.');
            this.router.navigate(['/inicio-gastos']);
          } else {
            console.error('El servidor respondió pero no envió un token válido:', res);
            this.errorMessage = 'Error: El servidor no devolvió el token de sesión.';
          }
        },
        error: (err) => {
          console.error('ERROR: El backend rechazó la petición o está apagado:', err);
          this.errorMessage = err.error?.error || 'No se pudo completar el acceso con Google.';
        }
      });

    } catch (error: any) {
      console.error('Error interno al procesar Google login:', error);
      this.errorMessage = 'No se pudo completar el acceso con Google.';
    }
  }

  onLogin(): void {
    if (!this.username || !this.password) {
      this.errorMessage = 'Por favor, completa todos los campos.';
      return;
    }

    this.errorMessage = '';

    this.authService.login(this.username, this.password).subscribe({
      next: (res) => {
        console.log('Login tradicional exitoso:', res);
        this.router.navigate(['/inicio-gastos']);
      },
      error: (err) => {
        console.error('Error en el login:', err);
        this.errorMessage = err.error?.error || err.error?.message || 'Usuario o contraseña incorrectos.';
      }
    });
  }
}
