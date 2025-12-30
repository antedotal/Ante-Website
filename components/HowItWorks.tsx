"use client";

import { motion } from "framer-motion";
import { Card } from "./ui/Card";
import { Camera, CheckCircle2, DollarSign, Users } from "lucide-react";

const steps = [
  {
    id: 1,
    title: "Set the Stakes",
    description: "Create a task and set your forfeit price. How much is your procrastination worth to you? $5? $50?",
    icon: DollarSign,
    color: "text-green-600 bg-green-50 border-green-100",
  },
  {
    id: 2,
    title: "Prove It",
    description: "Snap a photo evidence of your completed task. No cheating—your friends are the judges.",
    icon: Camera,
    color: "text-blue-600 bg-blue-50 border-blue-100",
  },
  {
    id: 3,
    title: "The Verdict",
    description: "Your friend reviews the photo. If they reject it twice, you pay the forfeit. Simple as that.",
    icon: Users,
    color: "text-purple-600 bg-purple-50 border-purple-100",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-4 relative">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900 font-serif-custom">
            The Loop of <span className="text-gradient font-sans-flex font-immersive">Accountability</span>
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-immersive">
            It's not just a todo list. It's a social contract with financial consequences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-linear-to-r from-transparent via-gray-200 to-transparent -translate-y-1/2 z-0" />

          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: index * 0.2, duration: 0.5 }}
              className="relative z-10"
            >
              <Card className="h-full flex flex-col items-center text-center p-8 font-sans-flex">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${step.color} border`}>
                  <step.icon className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-gray-900 font-immersive">{step.title}</h3>
                <p className="text-gray-500 leading-relaxed font-immersive">
                  {step.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
