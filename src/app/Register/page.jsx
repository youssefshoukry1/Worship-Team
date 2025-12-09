"use client";

import axios from "axios";
import { useFormik } from "formik";
import React, { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import * as Yup from "yup";
import { UserContext } from "../context/User_Context";


export default function Register() {
    let { setLogin } = useContext(UserContext);
    const [apiError, setError] = useState("");
    const [isLoading, setLoading] = useState(false);
    const router = useRouter();

    function handleRegister(formsData) {
        setLoading(true);
        axios
            .post("http://localhost:4000/api/users/register", formsData)
            .then((response) => {
                console.log("success", response);

                if (response.data.msg == "User created successfully") {
                    localStorage.setItem("user_Taspe7_Token", response.data.token);
                    localStorage.setItem('user_Taspe7_Role',response?.data?.user?.role)
                    setLogin(response.data.token);
                    setLoading(false);
                    console.log(response.data.user.role);
                    console.log("Going to login...");
                    
                    
                    router.push("/login");
                }
            })
            .catch((error) => {
                setError(error.response?.data?.message || "Something went wrong");
                setLoading(false);
            });

    }

    let validationSchema = Yup.object({
        Name: Yup.string()
            .required("name is required")
            .min(3, "min lenght is 3")
            .max(10, "max lenght is 10"),
        email: Yup.string()
            .required("email is required")
            .email("enter availed email"),
        password: Yup.string()
            .required("passowrd is required")
            .matches(
                /^[A-Z][a-z0-9]{5,7}$/,
                "min lenth is 6 and max is 8 and first letter should be capital"
            ),
        role: Yup.string(),
    });

    let formik = useFormik({
        initialValues: {
            Name: "",
            email: "",
            password: "",
            role: "",
        },
        validationSchema: validationSchema,
        onSubmit: handleRegister,
    });

    return (
        <>


            <div className="flex items-center justify-center px-4 sm:px-6 lg:px-8 sm:h-screen p-12 lg:p-0 ">
                <div className="w-full max-w-xs sm:max-w-md space-y-8 ">
                    <div className="bg-white shadow-md rounded-md p-6">
                        <h2 className="my-3 text-center text-3xl font-bold tracking-tight text-sky-400">
                            Register Now
                        </h2>

                        {apiError ? (
                            <div
                                className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400"
                                role="alert"
                            >
                                <span className="font-medium">{apiError}</span>
                            </div>
                        ) : null}

                        <form onSubmit={formik.handleSubmit} className="space-y-6">
                            {/* First Name */}
                            <div>
                                <label
                                    htmlFor="firstName"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                        Name
                                </label>
                                <div className="mt-1">
                                    <input
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        value={formik.values.Name}
                                        name="Name"
                                        id="Name"
                                        type="text"
                                        required
                                        className="px-2 py-3 mt-1 block w-full rounded-md border border-gray-300 shadow-sm"
                                    />
                                    {formik.errors.Name && formik.touched.Name ? (
                                        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50">
                                            <span className="font-medium">{formik.errors.Name}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                    Email
                                </label>
                                <div className="mt-1">
                                    <input
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        value={formik.values.email}
                                        name="email"
                                        id="email"
                                        type="email"
                                        required
                                        className="px-2 py-3 mt-1 block w-full rounded-md border border-gray-300 shadow-sm"
                                    />
                                    {formik.errors.email && formik.touched.email ? (
                                        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50">
                                            <span className="font-medium">{formik.errors.email}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                    Password
                                </label>
                                <div className="mt-1">
                                    <input
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        value={formik.values.password}
                                        name="password"
                                        id="password"
                                        type="password"
                                        required
                                        className="px-2 py-3 mt-1 block w-full rounded-md border border-gray-300 shadow-sm"
                                    />
                                    {formik.errors.password && formik.touched.password ? (
                                        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50">
                                            <span className="font-medium">{formik.errors.password}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>


                            {/* Role */}
                            <div>
                                <label
                                    htmlFor="role"
                                    className="block text-sm font-medium text-gray-700"
                                >
                                    Role
                                </label>
                                <div className="mt-1">
                                    <input
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        value={formik.values.role}
                                        name="role"
                                        id="role"
                                        type="text"
                                        
                                        className="px-2 py-3 mt-1 block w-full rounded-md border border-gray-300 shadow-sm"
                                    />
                                    {formik.errors.role && formik.touched.role ? (
                                        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50">
                                            <span className="font-medium">{formik.errors.role}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                className="w-full py-3 bg-sky-500 text-white rounded-md"
                            >
                                {isLoading ? "Loading..." : "Register"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
