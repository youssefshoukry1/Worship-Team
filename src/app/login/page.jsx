"use client";
import axios from 'axios';
import { useFormik } from 'formik';
import { useContext, useState } from 'react';
import { useRouter } from "next/navigation";
import { UserContext } from '../../app/context/User_Context';
import * as Yup from 'yup';

export default function Login() {
    const { setLogin } = useContext(UserContext);
    const [apiError, setError] = useState('');
    const [isLoading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = (formsData) => {
        setLoading(true);
        axios.post('https://worship-team-api.vercel.app/api/users/login', formsData)
            .then((response) => {
                console.log('success', response);
                if (response.data.msg === 'Login successful') {
                    localStorage.setItem('user_Taspe7_Token', response?.data?.token);
                    setLogin(response?.data?.token);
                    setLoading(false);
                    router.push("/"); // redirect to home
                }
            })
            .catch((error) => {
                setError(error.response?.data?.message || "Something went wrong");
                setLoading(false);
            });
    };

    const validationSchema = Yup.object({
        email: Yup.string().required('Email is required').email('Enter a valid email'),
        password: Yup.string()
            .required('Password is required')
            .matches(/^[A-Z][a-z0-9]{5,7}$/, 'Enter a valid password'),
    });

    const formik = useFormik({
        initialValues: { email: "", password: "" },
        validationSchema,
        onSubmit: handleLogin
    });

    return (
        <div className="flex h-screen items-center justify-center px-4 sm:px-6 lg:px-8 bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.1),transparent_50%)]" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8">
                    <h2 className="my-2 text-center text-3xl font-bold tracking-tight bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                        Welcome Back
                    </h2>
                    <p className="text-center text-gray-400 text-sm mb-6">
                        Sign in to access your dashboard
                    </p>

                    {apiError && (
                        <div className="p-4 mb-4 text-sm text-red-200 border border-red-500/20 rounded-lg bg-red-500/10" role="alert">
                            <span className="font-medium">{apiError}</span>
                        </div>
                    )}

                    <form onSubmit={formik.handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="ur-email" className="block text-sm font-medium text-gray-300">Email Address</label>
                            <input
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.email}
                                name='email'
                                id='ur-email'
                                type="email"
                                required
                                className="px-4 py-3 mt-1.5 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                placeholder="name@example.com"
                            />
                            {formik.errors.email && formik.touched.email && (
                                <div className="mt-1 text-red-400 text-xs">{formik.errors.email}</div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password</label>
                            <input
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.password}
                                name='password'
                                id='password'
                                type="password"
                                required
                                className="px-4 py-3 mt-1.5 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                placeholder="••••••••"
                            />
                            {formik.errors.password && formik.touched.password && (
                                <div className="mt-1 text-red-400 text-xs">{formik.errors.password}</div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full py-3.5 px-4 rounded-xl text-white font-bold shadow-lg transition-all transform active:scale-95
                                ${isLoading
                                    ? 'bg-gray-600/50 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                        >
                            {isLoading ? "Signing In..." : "Login"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
