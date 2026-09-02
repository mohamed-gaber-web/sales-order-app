import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { guestGuard, mfaChallengeGuard } from '../../core/auth';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then(m => m.LoginModule),
    canActivate: [guestGuard]
  },
  {
    // Reachable only mid-sign-in: the challenge lives in memory, so a direct
    // visit has nothing to verify.
    path: 'mfa',
    loadChildren: () => import('./mfa/mfa.module').then(m => m.MfaModule),
    canActivate: [mfaChallengeGuard]
  },
  {
    path: 'forgot-password',
    loadChildren: () => import('./forgot-password/forgot-password.module').then(m => m.ForgotPasswordModule)
  },
  {
    // Redeeming an emailed link. Unauthenticated by necessity — the person has
    // no credential yet, which is the point.
    path: 'reset-password',
    loadChildren: () => import('./reset-password/reset-password.module').then(m => m.ResetPasswordModule)
  },
  {
    path: 'accept-invitation',
    loadChildren: () => import('./accept-invitation/accept-invitation.module').then(m => m.AcceptInvitationModule)
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule {}
