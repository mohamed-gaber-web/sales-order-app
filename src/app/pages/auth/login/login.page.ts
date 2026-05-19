import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { UserAuthService } from '../../../core/services/user-auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  form: FormGroup;
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: UserAuthService,
  ) {
    this.form = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]],
    });
  }

  async signIn() {
    if (this.form.invalid || this.isLoading) return;
    this.errorMessage = '';
    this.isLoading = true;

    // Mock auth — replace with real API call when ready
    await new Promise(r => setTimeout(r, 1400));

    const { email, password } = this.form.value as { email: string; password: string };
    if (password.length < 4) {
      this.errorMessage = 'Invalid email or password. Please try again.';
      this.isLoading = false;
      return;
    }

    this.auth.signIn(email);
    this.isLoading = false;
    this.router.navigateByUrl('/dashboard');
  }

  signInWithMicrosoft() {
    this.isLoading = true;
    // TODO: replace with real Azure AD MSAL flow
    setTimeout(() => {
      this.auth.signIn('user@growpath.net');
      this.isLoading = false;
      this.router.navigateByUrl('/dashboard');
    }, 1600);
  }
}
