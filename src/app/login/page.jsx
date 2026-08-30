"use client";
import axios from 'axios';
import { useContext, useState } from 'react';
import { useRouter } from "next/navigation";
import { UserContext } from '../../app/context/User_Context';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
    const { t } = useLanguage();
    const { setLogin, setTeams } = useContext(UserContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [apiError, setError] = useState('');
    const [isLoading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const formsData = { email, password };
        axios.post('https://worship-team-api.onrender.com/api/users/login', formsData)
            .then((response) => {
                console.log('success', response);
                if (response.data.msg === 'Login successful') {
                    localStorage.setItem('user_Taspe7_Token', response?.data?.token);
                    localStorage.setItem('user_Taspe7_ID', response?.data?.user?.id);
                    localStorage.setItem('user_Taspe7_GlobalRole', response?.data?.user?.global_role);
                    localStorage.setItem('user_Taspe7_SubRole', response?.data?.user?.sub_role);
                    localStorage.setItem('user_Taspe7_ChurchId', response?.data?.user?.churchId);
                    localStorage.setItem('user_Taspe7_Status', response?.data?.user?.status);
                    localStorage.setItem('user_Taspe7_Email', response?.data?.user?.email);
                    const teams = response?.data?.user?.teams || [];
                    localStorage.setItem('user_Taspe7_Teams', JSON.stringify(teams));

                    setLogin(response?.data?.token);
                    if (setTeams) setTeams(teams);
                    setLoading(false);
                    window.location.href = "/";
                }
            })
            .catch((error) => {
                setError(error.response?.data?.message || t("somethingWentWrong"));
                setLoading(false);
            });
    };

    return (
        <div className="flex h-screen items-center justify-center px-4 sm:px-6 lg:px-8 bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.1),transparent_50%)]" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8">
                    <h2 className="my-2 text-center text-3xl font-bold tracking-tight bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                        {t("welcomeBack")}
                    </h2>
                    <p className="text-center text-gray-400 text-sm mb-6">
                        {t("signInToDashboard")}
                    </p>

                    {apiError && (
                        <div className="p-4 mb-4 text-sm text-red-200 border border-red-500/20 rounded-lg bg-red-500/10" role="alert">
                            <span className="font-medium">{apiError}</span>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label htmlFor="ur-email" className="block text-sm font-medium text-gray-300">{t("emailAddress")}</label>
                            <input
                                onChange={(e) => setEmail(e.target.value)}
                                value={email}
                                name='email'
                                id='ur-email'
                                type="email"
                                required
                                className="px-4 py-3 mt-1.5 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                placeholder="name@example.com"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label htmlFor="password" className="block text-sm font-medium text-gray-300">{t("password")}</label>
                                <a
                                    href="/forgot-password"
                                    className="text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium"
                                >
                                    {t("forgotPassword")}
                                </a>
                            </div>
                            <input
                                onChange={(e) => setPassword(e.target.value)}
                                value={password}
                                name='password'
                                id='password'
                                type="password"
                                required
                                minLength={3}
                                className="px-4 py-3 mt-1.5 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full py-3.5 px-4 rounded-xl text-white font-bold shadow-lg transition-all transform active:scale-95
                                ${isLoading
                                    ? 'bg-gray-600/50 cursor-not-allowed'
                                    : 'bg-linear-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                        >
                            {isLoading ? t("signingIn") : t("login")}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}