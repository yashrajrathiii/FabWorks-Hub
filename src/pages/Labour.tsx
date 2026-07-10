import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import WorkersTab from "@/components/labour/WorkersTab";
import AttendanceTab from "@/components/labour/AttendanceTab";
import TasksTab from "@/components/labour/TasksTab";

export default function Labour() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <Tabs defaultValue="attendance">
        <TabsList className="mb-4 grid w-full grid-cols-3 sm:w-auto sm:inline-grid md:h-11 md:p-1">
          <TabsTrigger value="attendance" className="md:text-sm lg:text-base md:px-5 md:py-2">Attendance</TabsTrigger>
          <TabsTrigger value="workers" className="md:text-sm lg:text-base md:px-5 md:py-2">Workers</TabsTrigger>
          <TabsTrigger value="tasks" className="md:text-sm lg:text-base md:px-5 md:py-2">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance">
          <AttendanceTab />
        </TabsContent>
        <TabsContent value="workers">
          <WorkersTab />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
